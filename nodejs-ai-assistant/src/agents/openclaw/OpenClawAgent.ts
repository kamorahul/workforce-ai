/**
 * OpenClaw Agent
 *
 * AI agent that connects through OpenClaw gateway for multi-platform support.
 * Routes messages from WhatsApp, Telegram, etc. through existing Kai skills.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Channel, StreamChat } from 'stream-chat';
import type { AIAgent, MentionedUser, TimezoneContext } from '../types';
import { User } from '../createAgent';
import {
  OpenClawClient,
  OpenClawMessage,
  getOpenClawClient,
  initOpenClawClient,
} from '../../services/openclaw/OpenClawClient';
import {
  OpenClawService,
  getOpenClawService,
} from '../../services/openclaw/OpenClawService';
import { SkillContext } from '../../services/openclaw/types';
import { Task } from '../../models/Task';
import { Event } from '../../models/Event';
import { Thread } from '../../models/Thread';
import { getStreamFeedsService } from '../../utils/getstreamFeedsService';

// System prompt for Kai via OpenClaw
const OPENCLAW_SYSTEM_PROMPT = `You are Kai, a friendly and intelligent personal assistant for Convoe - a team collaboration app. You're helping users through WhatsApp, Telegram, or other messaging platforms.

PERSONALITY:
- Warm and professional, not robotic
- Proactive - offer helpful suggestions
- Concise - keep messages short for mobile chat
- Use natural conversational language

YOUR CAPABILITIES:
1. Create tasks for the user (use the create_task tool)
2. Create calendar events (use the create_event tool)
3. Fetch and summarize tasks (use the get_tasks tool)
4. Fetch and summarize events (use the get_events tool)
5. Answer questions about their work

RESPONSE STYLE:
- Keep responses concise for mobile messaging
- Use emojis sparingly but naturally
- Break long responses into multiple short messages if needed

EXAMPLES:
User: "Create a task to call John tomorrow"
→ Use create_task tool, then respond: "Done! I've created a task to call John, due tomorrow."

User: "What's on my schedule?"
→ Use get_events tool with upcoming=true, then summarize the events conversationally.

User: "Show me my tasks"
→ Use get_tasks tool, then list them in a friendly format.

Be helpful, be concise, be Kai.`;

export class OpenClawAgent implements AIAgent {
  private anthropic?: Anthropic;
  private openclawClient?: OpenClawClient;
  private openclawService: OpenClawService;
  private lastInteractionTs = Date.now();
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(
    readonly chatClient: StreamChat,
    readonly channel: Channel,
    readonly user: User
  ) {
    this.openclawService = getOpenClawService();
  }

  dispose = async () => {
    // Don't disconnect the shared OpenClaw client
    this.conversationHistory = [];
  };

  getLastInteraction = (): number => this.lastInteractionTs;

  init = async (_agentId: string) => {
    console.log('[OpenClawAgent] Initializing...');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[OpenClawAgent] Anthropic API key is missing');
      throw new Error('Anthropic API key is required');
    }

    this.anthropic = new Anthropic({ apiKey });

    // Initialize OpenClaw client
    try {
      this.openclawClient = await initOpenClawClient() || undefined;
      if (this.openclawClient) {
        console.log('[OpenClawAgent] OpenClaw client connected');
        this.setupOpenClawHandlers();
      } else {
        console.log('[OpenClawAgent] Running without OpenClaw (gateway not configured)');
      }
    } catch (error) {
      console.warn('[OpenClawAgent] Could not connect to OpenClaw:', error);
    }

    // Load or create thread for conversation history
    const threadDoc = await Thread.findOneAndUpdate(
      {
        channelId: this.channel.id,
        userId: this.user.id,
      },
      {
        $setOnInsert: {
          channelId: this.channel.id,
          userId: this.user.id,
          openAiThreadId: `openclaw_${this.channel.id}_${this.user.id}_${Date.now()}`,
          conversationHistory: [],
        },
        $set: {
          provider: 'openclaw',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    // Load persisted conversation history
    if (threadDoc.conversationHistory && threadDoc.conversationHistory.length > 0) {
      this.conversationHistory = threadDoc.conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : '',
      }));
      console.log(`[OpenClawAgent] Loaded ${this.conversationHistory.length} messages from history`);
    }

    console.log('[OpenClawAgent] Initialized');
  };

  /**
   * Set up handlers for OpenClaw messages
   */
  private setupOpenClawHandlers(): void {
    if (!this.openclawClient) return;

    this.openclawClient.on('message', async (message: OpenClawMessage) => {
      console.log(`[OpenClawAgent] Received message from ${message.channel}:`, message.text);

      try {
        // Process the message
        const response = await this.processOpenClawMessage(message);

        // Send response back through OpenClaw
        await this.openclawClient?.sendMessage({
          channel: message.channel,
          chatId: message.chatId,
          text: response,
          replyToMessageId: message.id,
        });
      } catch (error) {
        console.error('[OpenClawAgent] Error processing message:', error);

        // Send error response
        await this.openclawClient?.sendMessage({
          channel: message.channel,
          chatId: message.chatId,
          text: "Sorry, I encountered an error. Please try again.",
        });
      }
    });

    this.openclawClient.on('error', (error) => {
      console.error('[OpenClawAgent] OpenClaw error:', error);
    });

    this.openclawClient.on('disconnected', () => {
      console.log('[OpenClawAgent] OpenClaw disconnected');
    });
  }

  /**
   * Process a message from OpenClaw and generate a response
   */
  private async processOpenClawMessage(message: OpenClawMessage): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Anthropic not initialized');
    }

    // Build skill context
    const skillContext: SkillContext = {
      userId: this.user.id,
      channelId: this.channel.id,
      timezone: 'UTC', // TODO: Get timezone from user profile
    };

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: message.text,
    });

    // Get available tools
    const tools = this.openclawService.getClaudeToolDefinitions();

    // Add timezone context
    const today = new Date().toISOString().split('T')[0];
    const systemPrompt = `${OPENCLAW_SYSTEM_PROMPT}\n\nToday is ${today}. User is messaging from ${message.channel}.`;

    // Make API call
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: this.conversationHistory.slice(-20).map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      tools: tools.length > 0 ? tools : undefined,
    });

    // Handle tool use if needed
    let finalResponse = '';

    if (response.stop_reason === 'tool_use') {
      finalResponse = await this.handleToolUse(response, skillContext, systemPrompt);
    } else {
      // Extract text response
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      finalResponse = textBlocks.map((block) => block.text).join('\n');
    }

    // Add assistant response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: finalResponse,
    });

    // Save conversation history (trimmed)
    await this.saveConversationHistory();

    this.lastInteractionTs = Date.now();

    return finalResponse;
  }

  /**
   * Handle tool use in the response
   */
  private async handleToolUse(
    response: Anthropic.Message,
    context: SkillContext,
    systemPrompt: string
  ): Promise<string> {
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      return textBlocks.map((block) => block.text).join('\n');
    }

    // Execute tools
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      console.log(`[OpenClawAgent] Executing tool: ${toolUse.name}`);

      const result = await this.openclawService.executeSkill(
        toolUse.name,
        toolUse.input,
        context
      );

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    // Continue conversation with tool results
    const messages: Anthropic.MessageParam[] = [
      ...this.conversationHistory.slice(-18).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'assistant' as const,
        content: response.content,
      },
      {
        role: 'user' as const,
        content: toolResults,
      },
    ];

    const tools = this.openclawService.getClaudeToolDefinitions();

    const followUpResponse = await this.anthropic!.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Recursively handle more tool use if needed
    if (followUpResponse.stop_reason === 'tool_use') {
      return this.handleToolUse(followUpResponse, context, systemPrompt);
    }

    const textBlocks = followUpResponse.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    return textBlocks.map((block) => block.text).join('\n');
  }

  /**
   * Handle message from Stream Chat (existing flow)
   */
  public handleMessage = async (
    text: string,
    messageId?: string,
    attachments?: any[],
    usePersistentThread: boolean = false,
    mentionedUsers?: MentionedUser[],
    timezoneContext?: TimezoneContext
  ) => {
    if (!this.anthropic) {
      console.error('[OpenClawAgent] Not initialized');
      return;
    }

    if (!text) {
      return;
    }

    this.lastInteractionTs = Date.now();

    const isKaiChannel = this.channel.id?.indexOf('kai') === 0;

    // Build skill context
    const skillContext: SkillContext = {
      userId: this.user.id,
      channelId: this.channel.id,
      timezone: timezoneContext?.timezone || 'UTC',
      mentionedUsers,
    };

    // Add message to history
    this.conversationHistory.push({
      role: 'user',
      content: text,
    });

    try {
      if (isKaiChannel) {
        await this.channel.sendEvent({
          type: 'ai_indicator.update',
          ai_state: 'AI_STATE_INDICATOR_VISIBLE',
          user: { id: 'kai' },
        });
      }

      // Get tools
      const tools = this.openclawService.getClaudeToolDefinitions();

      const today = new Date().toISOString().split('T')[0];
      let systemPrompt = OPENCLAW_SYSTEM_PROMPT;

      if (timezoneContext) {
        systemPrompt += `\n\nToday is ${today}. User's timezone: ${timezoneContext.timezone} (${timezoneContext.offsetString}).`;
      } else {
        systemPrompt += `\n\nToday is ${today}.`;
      }

      // Make API call
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: this.conversationHistory.slice(-20).map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        tools: tools.length > 0 ? tools : undefined,
      });

      // Handle response
      let finalResponse = '';

      if (response.stop_reason === 'tool_use') {
        finalResponse = await this.handleToolUse(response, skillContext, systemPrompt);
      } else {
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        finalResponse = textBlocks.map((block) => block.text).join('\n');
      }

      // Add to history
      this.conversationHistory.push({
        role: 'assistant',
        content: finalResponse,
      });

      // Send response
      if (isKaiChannel) {
        await this.channel.sendMessage({
          text: finalResponse,
          user: { id: 'kai' },
          ai_generated: true,
        });
      } else if (messageId) {
        // Update original message with response
        await this.chatClient.updateMessage({
          id: messageId,
          text: text,
          extraData: {
            aiResponse: finalResponse,
            processing: false,
          },
        });
      }

      if (isKaiChannel) {
        await this.channel.sendEvent({
          type: 'ai_indicator.clear',
          user: { id: 'kai' },
        });
      }

      // Save history
      await this.saveConversationHistory();

    } catch (error) {
      console.error('[OpenClawAgent] Error handling message:', error);

      if (isKaiChannel) {
        await this.channel.sendEvent({
          type: 'ai_indicator.clear',
          user: { id: 'kai' },
        });
      }
    }
  };

  /**
   * Save conversation history to database
   */
  private async saveConversationHistory(): Promise<void> {
    try {
      const historyToSave = this.conversationHistory.slice(-20).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content.length > 2000 ? msg.content.substring(0, 2000) + '...' : msg.content,
        timestamp: new Date(),
      }));

      await Thread.updateOne(
        {
          channelId: this.channel.id,
          userId: this.user.id,
        },
        {
          $set: {
            conversationHistory: historyToSave,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        }
      );
    } catch (error) {
      console.error('[OpenClawAgent] Error saving conversation history:', error);
    }
  }
}
