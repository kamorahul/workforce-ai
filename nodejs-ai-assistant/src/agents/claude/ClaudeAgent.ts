import Anthropic from '@anthropic-ai/sdk';
import { ClaudeResponseHandler } from './ClaudeResponseHandler';
import type { AIAgent } from '../types';
import type { Channel, StreamChat } from 'stream-chat';
import { User } from '../createAgent';
import { Thread, IThread } from '../../models/Thread';
import { Task } from '../../models/Task';
import {
  AssistantType,
  getAssistantConfig,
  getAssistantTypeFromOpenAIId,
  getClaudeTools,
  AssistantConfig,
} from '../../config/prompts';

type MessageContent = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: MessageContent;
}

export class ClaudeAgent implements AIAgent {
  private anthropic?: Anthropic;
  private assistantConfig?: AssistantConfig;
  private assistantType?: AssistantType;
  private conversationHistory: ConversationMessage[] = [];
  private lastInteractionTs = Date.now();
  private threadDoc?: IThread;

  private handlers: ClaudeResponseHandler[] = [];

  constructor(
    readonly chatClient: StreamChat,
    readonly channel: Channel,
    readonly user: User
  ) {}

  dispose = async () => {
    await this.chatClient.disconnectUser();
    this.handlers.forEach((handler) => handler.dispose());
    this.handlers = [];
  };

  getLastInteraction = (): number => this.lastInteractionTs;

  init = async (agentId: string) => {
    console.log('=== Claude Assistant Init Debug ===');
    console.log('Initializing Claude assistant with ID:', agentId);

    const apiKey = process.env.ANTHROPIC_API_KEY as string | undefined;
    if (!apiKey) {
      console.error('Anthropic API key is missing');
      throw new Error('Anthropic API key is required');
    }

    this.anthropic = new Anthropic({ apiKey });

    // Map OpenAI assistant ID to our assistant type
    this.assistantType = getAssistantTypeFromOpenAIId(agentId);
    if (!this.assistantType) {
      // Default to qa_assistant if unknown
      console.warn(`Unknown assistant ID: ${agentId}, defaulting to qa_assistant`);
      this.assistantType = 'qa_assistant';
    }

    this.assistantConfig = getAssistantConfig(this.assistantType);
    console.log(`Using Claude with assistant type: ${this.assistantType}`);
    console.log(`Assistant name: ${this.assistantConfig.name}`);

    // Load or create thread with conversation history support
    // Use findOneAndUpdate with upsert to handle race conditions atomically
    const threadDoc = await Thread.findOneAndUpdate(
      {
        channelId: this.channel.id,
        userId: this.user.id,
      },
      {
        $setOnInsert: {
          channelId: this.channel.id,
          userId: this.user.id,
          openAiThreadId: `claude_${this.channel.id}_${this.user.id}_${Date.now()}`,
          conversationHistory: [],
        },
        $set: {
          provider: 'claude',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    this.threadDoc = threadDoc;

    // Load persisted conversation history
    if (threadDoc.conversationHistory && threadDoc.conversationHistory.length > 0) {
      this.conversationHistory = threadDoc.conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      console.log(`Loaded ${this.conversationHistory.length} messages from conversation history`);
    } else {
      this.conversationHistory = [];
      console.log('Started new conversation (no history)');
    }
  };

  public handleMessage = async (
    e: string,
    messageId?: string,
    attachments?: any[],
    usePersistentThread: boolean = false,
    mentionedUsers?: { id: string; name: string }[]
  ) => {
    if (!this.anthropic || !this.assistantConfig) {
      console.error('Claude not initialized');
      return;
    }

    if (!e) {
      return;
    }

    this.lastInteractionTs = Date.now();

    const isKaiUser = this.user.id === 'kai' || this.channel.id?.indexOf('kai') === 0;

    let systemPrompt = this.assistantConfig.systemPrompt;
    let messageContent: MessageContent = e;

    if (isKaiUser && !usePersistentThread) {
      // FOR DAILY SUMMARY AGENT: Create context with recent conversations
      console.log('Using temporary context for daily summary (no conversation memory)');

      try {
        const context = await this.buildDailySummaryContext();
        const today = new Date().toISOString().split('T')[0];

        // Handle attachments (images)
        if (attachments && attachments.length > 0) {
          messageContent = await this.buildMessageWithAttachments(e, attachments);
          systemPrompt += `\n\nToday is ${today}. Analyze the image and respond to the user's question. Be detailed and helpful.`;
        } else if (context.messages.length > 0 || context.tasks.length > 0) {
          const contextText = this.formatContext(context);
          messageContent = `Today is ${today}.\n\n${contextText}\n\nPlease provide a daily summary for ${this.user.name}.`;
          systemPrompt += `\n\nAnalyze these conversations and tasks. Include task progress in your summary. Remember dates in messages are relative to when they were sent, not today (${today}).`;
        } else {
          messageContent = `Today is ${today}. No recent conversations or tasks found. Greet ${this.user.name} and let them know all is good.`;
          systemPrompt += `\n\nGreet the user warmly.`;
        }

        // Don't persist conversation for daily summary
        this.conversationHistory = [];
      } catch (error) {
        console.error('Error building daily summary context:', error);
      }
    } else if (isKaiUser && usePersistentThread) {
      // FOR Q&A AGENT: Use persistent conversation history
      console.log('Using persistent conversation for Q&A');

      const today = new Date().toISOString().split('T')[0];

      // Handle attachments
      if (attachments && attachments.length > 0) {
        messageContent = await this.buildMessageWithAttachments(e, attachments);
      }

      // Check if asking about tasks
      const isAskingAboutTasks =
        e &&
        (e.toLowerCase().includes('task') ||
          e.toLowerCase().includes('todo') ||
          e.toLowerCase().includes('completed') ||
          e.toLowerCase().includes('in progress'));

      if (isAskingAboutTasks) {
        const taskContext = await this.buildTaskContext();
        systemPrompt += `\n\nToday is ${today}. The user is asking about tasks. Here is their current task summary:${taskContext}\n\nFormat your response cleanly with proper task names and due dates. Be conversational and helpful.`;
      } else {
        systemPrompt += `\n\nToday is ${today}. Answer the user's question based on the conversation history. Be helpful and conversational.`;
      }
    } else {
      // FOR REGULAR USERS: Standard handling
      const today = new Date().toISOString().split('T')[0];

      if (attachments && attachments.length > 0) {
        messageContent = await this.buildMessageWithAttachments(e, attachments);
      }

      systemPrompt += `\n\nToday's date is ${today}.`;
    }

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: messageContent,
    });

    try {
      // Get tools for this assistant
      const tools = getClaudeTools(this.assistantConfig.tools);

      // Create the message stream
      const stream = this.anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: this.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        tools: tools.length > 0 ? tools : undefined,
      });

      const handler = new ClaudeResponseHandler(
        this.anthropic,
        stream,
        this.chatClient,
        this.channel,
        this.user,
        messageId,
        mentionedUsers,
        this.assistantType!,
        this.conversationHistory,
        systemPrompt,
        tools,
        // Save conversation history after response is complete
        usePersistentThread ? this.saveConversationHistory : undefined
      );

      void handler.run();
      this.handlers.push(handler);
    } catch (error) {
      console.error('Error in handleMessage:', error);
    }
  };

  private buildMessageWithAttachments = async (
    text: string,
    attachments: any[]
  ): Promise<Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>> => {
    const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

    // Add text first
    if (text) {
      content.push({ type: 'text', text });
    }

    // Process attachments
    for (const attachment of attachments) {
      const isImage =
        attachment.type === 'image' ||
        attachment.mime_type?.startsWith('image/') ||
        attachment.type?.startsWith('image/');

      if (isImage && attachment.url) {
        try {
          // Fetch image and convert to base64
          const response = await fetch(attachment.url);
          const arrayBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');

          // Determine media type
          let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
          if (attachment.mime_type) {
            if (attachment.mime_type.includes('png')) mediaType = 'image/png';
            else if (attachment.mime_type.includes('gif')) mediaType = 'image/gif';
            else if (attachment.mime_type.includes('webp')) mediaType = 'image/webp';
          }

          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          });
          console.log('Added image attachment to message');
        } catch (error) {
          console.error('Error processing image attachment:', error);
          content.push({
            type: 'text',
            text: `[Image attachment could not be processed: ${attachment.name || 'unknown'}]`,
          });
        }
      } else {
        // For non-image attachments, add as text reference
        content.push({
          type: 'text',
          text: `[Attachment: ${attachment.name || attachment.filename || 'document'}]`,
        });
      }
    }

    return content;
  };

  private buildDailySummaryContext = async (): Promise<{
    messages: string[];
    tasks: string[];
  }> => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let recentMessages: string[] = [];
    let taskSummary: string[] = [];

    try {
      // Fetch channels
      const channels = await this.chatClient.queryChannels({
        members: { $in: [this.user.id] },
      });

      // Fetch messages from each channel
      for (const channel of channels) {
        if (channel.id?.indexOf('kai') === 0) continue;

        const result = await channel.query({
          messages: {
            created_at_after_or_equal: sevenDaysAgo.toISOString(),
            limit: 100,
          },
        });

        const formatted = result.messages
          .filter((msg) => msg.type !== 'system' && msg.user?.name && msg.created_at)
          .map((msg) => {
            const date = new Date(msg.created_at!).toISOString().split('T')[0];
            return `[${date}] ${msg.user?.name}: ${msg.text}`;
          });

        recentMessages.push(...formatted);
      }

      console.log(`Fetched ${recentMessages.length} recent messages`);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }

    try {
      // Fetch tasks
      const tasks = await Task.find({
        $or: [{ assignee: { $in: [this.user.id] } }, { createdBy: this.user.id }],
      })
        .select('name status completed createdAt completionDate assignee')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const completedTasks = tasks.filter((t) => t.status === 'completed' || t.completed);
      const inProgressTasks = tasks.filter((t) => t.status === 'in_progress' && !t.completed);
      const todoTasks = tasks.filter((t) => t.status === 'todo' && !t.completed);

      if (completedTasks.length > 0) {
        taskSummary.push(`\nCompleted Tasks (${completedTasks.length}):`);
        completedTasks.slice(0, 10).forEach((task) => {
          taskSummary.push(`Completed: ${task.name}`);
        });
      }

      if (inProgressTasks.length > 0) {
        taskSummary.push(`\nIn Progress Tasks (${inProgressTasks.length}):`);
        inProgressTasks.slice(0, 10).forEach((task) => {
          taskSummary.push(`In Progress: ${task.name}`);
        });
      }

      if (todoTasks.length > 0) {
        taskSummary.push(`\nTo Do Tasks (${todoTasks.length}):`);
        todoTasks.slice(0, 10).forEach((task) => {
          const dueDate = task.completionDate
            ? new Date(task.completionDate).toISOString().split('T')[0]
            : 'No due date';
          taskSummary.push(`To Do: ${task.name} (Due: ${dueDate})`);
        });
      }

      console.log(`Fetched ${tasks.length} tasks`);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }

    return { messages: recentMessages, tasks: taskSummary };
  };

  private formatContext = (context: { messages: string[]; tasks: string[] }): string => {
    let formatted = '';

    if (context.messages.length > 0) {
      formatted += `Recent Conversations (Last 7 days):\n${context.messages.join('\n')}`;
    }

    if (context.tasks.length > 0) {
      if (formatted) formatted += '\n\n';
      formatted += `Task Status:\n${context.tasks.join('\n')}`;
    }

    return formatted;
  };

  private buildTaskContext = async (): Promise<string> => {
    let taskContext = '';

    try {
      const tasks = await Task.find({
        $or: [{ assignee: { $in: [this.user.id] } }, { createdBy: this.user.id }],
      })
        .select('name status completed createdAt completionDate assignee')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const completedTasks = tasks.filter((t) => t.status === 'completed' || t.completed);
      const inProgressTasks = tasks.filter((t) => t.status === 'in_progress' && !t.completed);
      const todoTasks = tasks.filter((t) => t.status === 'todo' && !t.completed);

      taskContext = `\n\n[User's Current Tasks - ${new Date().toISOString().split('T')[0]}]\n`;

      if (completedTasks.length > 0) {
        taskContext += `Completed (${completedTasks.length}): ${completedTasks
          .filter((t) => t.name)
          .slice(0, 5)
          .map((t) => t.name)
          .join(', ')}\n`;
      }

      if (inProgressTasks.length > 0) {
        taskContext += `In Progress (${inProgressTasks.length}): ${inProgressTasks
          .filter((t) => t.name)
          .slice(0, 5)
          .map((t) => t.name)
          .join(', ')}\n`;
      }

      if (todoTasks.length > 0) {
        taskContext += `To Do (${todoTasks.length}): ${todoTasks
          .filter((t) => t.name)
          .slice(0, 5)
          .map(
            (t) =>
              `${t.name} (Due: ${
                t.completionDate
                  ? new Date(t.completionDate).toISOString().split('T')[0]
                  : 'No due date'
              })`
          )
          .join(', ')}`;
      }
    } catch (error) {
      console.error('Error fetching tasks for context:', error);
    }

    return taskContext;
  };

  private saveConversationHistory = async (): Promise<void> => {
    if (!this.threadDoc) {
      console.warn('No thread document found, cannot save conversation history');
      return;
    }

    try {
      // Convert conversation history to the format expected by the model
      const historyToSave = this.conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        timestamp: new Date(),
      }));

      // Keep only the last 50 messages to prevent unbounded growth
      const trimmedHistory = historyToSave.slice(-50);

      await Thread.updateOne(
        { _id: this.threadDoc._id },
        {
          $set: {
            conversationHistory: trimmedHistory,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Refresh TTL
          },
        }
      );

      console.log(`Saved ${trimmedHistory.length} messages to conversation history`);
    } catch (error) {
      console.error('Error saving conversation history:', error);
    }
  };
}
