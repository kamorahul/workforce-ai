/**
 * OpenClaw Webhook Controller
 *
 * Handles incoming messages from OpenClaw gateway (WhatsApp, Telegram, etc.)
 * Maps external users to Convoe users and processes messages through Kai.
 */

import { Router, Request, Response } from 'express';
import { StreamChat } from 'stream-chat';
import Anthropic from '@anthropic-ai/sdk';
import { apiKey, apiSecret } from '../serverClient';
import { User } from '../models/User';
import { Task } from '../models/Task';
import { Event } from '../models/Event';
import { getOpenClawService } from '../services/openclaw';
import { SkillContext } from '../services/openclaw/types';

const router = Router();

// External user mapping model (create if not exists)
interface ExternalUserMapping {
  externalPlatform: 'whatsapp' | 'telegram' | 'slack' | 'discord';
  externalUserId: string;
  convoeUserId?: string;
  phoneNumber?: string;
  displayName?: string;
  verified: boolean;
  createdAt: Date;
  lastMessageAt: Date;
}

// In-memory cache for user mappings (use Redis in production)
const userMappingCache = new Map<string, ExternalUserMapping>();

// Anthropic client
let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

// System prompt for external platform users
const EXTERNAL_PLATFORM_PROMPT = `You are Kai, a friendly and intelligent personal assistant for Convoe - a team collaboration app. Users are messaging you from WhatsApp, Telegram, or other platforms.

PERSONALITY:
- Warm and professional
- Proactive with helpful suggestions
- Keep responses concise for mobile messaging
- Use natural conversational language

YOUR CAPABILITIES:
1. Create tasks (use create_task tool)
2. Create calendar events (use create_event tool)
3. Fetch tasks (use get_tasks tool)
4. Fetch events (use get_events tool)
5. Answer questions about work

RESPONSE STYLE:
- Short, mobile-friendly responses
- Break long info into bullet points
- Confirm actions clearly

EXAMPLES:
User: "remind me to call mom tomorrow at 3pm"
→ Use create_event tool with title="Call mom", startDate=tomorrow 3pm
→ "Got it! I've scheduled 'Call mom' for tomorrow at 3pm."

User: "what tasks do I have?"
→ Use get_tasks tool
→ List tasks briefly with status

Be helpful, be concise, be Kai.`;

/**
 * Get or create user mapping for external platform user
 */
async function getOrCreateUserMapping(
  platform: string,
  externalUserId: string,
  displayName?: string,
  phoneNumber?: string
): Promise<ExternalUserMapping> {
  const cacheKey = `${platform}:${externalUserId}`;

  // Check cache first
  let mapping = userMappingCache.get(cacheKey);

  if (!mapping) {
    // Create new mapping
    mapping = {
      externalPlatform: platform as ExternalUserMapping['externalPlatform'],
      externalUserId,
      displayName,
      phoneNumber,
      verified: false,
      createdAt: new Date(),
      lastMessageAt: new Date(),
    };
    userMappingCache.set(cacheKey, mapping);

    // Try to find existing Convoe user by phone number
    if (phoneNumber) {
      const existingUser = await User.findOne({ phone: phoneNumber });
      if (existingUser) {
        mapping.convoeUserId = existingUser._id.toString();
        mapping.verified = true;
        console.log(`[OpenClawWebhook] Linked ${platform} user to Convoe user: ${existingUser._id}`);
      }
    }
  }

  mapping.lastMessageAt = new Date();
  return mapping;
}

/**
 * Process message with AI
 */
async function processWithAI(
  message: string,
  userId: string,
  platform: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const client = getAnthropic();
  const openclawService = getOpenClawService();

  // Get available tools
  const tools = openclawService.getClaudeToolDefinitions();

  const today = new Date().toISOString().split('T')[0];
  const systemPrompt = `${EXTERNAL_PLATFORM_PROMPT}\n\nToday is ${today}. User is on ${platform}.`;

  // Build skill context
  const skillContext: SkillContext = {
    userId,
    timezone: 'UTC', // TODO: Detect from phone number or user profile
  };

  // Make API call
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversationHistory.slice(-10).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    tools: tools.length > 0 ? tools : undefined,
  });

  // Handle tool use
  if (response.stop_reason === 'tool_use') {
    const toolResults = await handleToolUse(response, skillContext, openclawService);

    // Continue with tool results
    const followUp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        ...conversationHistory.slice(-8).map((msg) => ({
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
      ],
      tools: tools.length > 0 ? tools : undefined,
    });

    const textBlocks = followUp.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    return textBlocks.map((block) => block.text).join('\n');
  }

  // Extract text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  return textBlocks.map((block) => block.text).join('\n');
}

/**
 * Handle tool use
 */
async function handleToolUse(
  response: Anthropic.Message,
  context: SkillContext,
  openclawService: ReturnType<typeof getOpenClawService>
): Promise<Anthropic.ToolResultBlockParam[]> {
  const toolUseBlocks = response.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );

  const results: Anthropic.ToolResultBlockParam[] = [];

  for (const toolUse of toolUseBlocks) {
    console.log(`[OpenClawWebhook] Executing tool: ${toolUse.name}`);

    const result = await openclawService.executeSkill(
      toolUse.name,
      toolUse.input,
      context
    );

    results.push({
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: JSON.stringify(result),
    });
  }

  return results;
}

// Conversation history cache (use Redis in production)
const conversationCache = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

/**
 * POST /openclaw/message
 *
 * Webhook endpoint for receiving messages from OpenClaw gateway
 */
router.post('/message', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      platform,
      userId: externalUserId,
      chatId,
      message,
      displayName,
      phoneNumber,
      attachments,
      isGroup,
      groupName,
    } = req.body;

    console.log(`[OpenClawWebhook] Received message from ${platform}:`, {
      externalUserId,
      chatId,
      messagePreview: message?.text?.substring(0, 50),
      isGroup,
    });

    // Validate required fields
    if (!platform || !externalUserId || !message?.text) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: platform, userId, message.text',
      });
      return;
    }

    // Get or create user mapping
    const userMapping = await getOrCreateUserMapping(
      platform,
      externalUserId,
      displayName,
      phoneNumber
    );

    // Use mapped Convoe user ID or external ID
    const effectiveUserId = userMapping.convoeUserId || `external_${platform}_${externalUserId}`;

    // Get conversation history
    const conversationKey = `${platform}:${chatId || externalUserId}`;
    let history = conversationCache.get(conversationKey) || [];

    // Add user message to history
    history.push({
      role: 'user',
      content: message.text,
    });

    // Process with AI
    const response = await processWithAI(
      message.text,
      effectiveUserId,
      platform,
      history
    );

    // Add response to history
    history.push({
      role: 'assistant',
      content: response,
    });

    // Trim history to last 20 messages
    if (history.length > 20) {
      history = history.slice(-20);
    }
    conversationCache.set(conversationKey, history);

    console.log(`[OpenClawWebhook] Response generated for ${platform}:${externalUserId}`);

    res.json({
      success: true,
      response: {
        text: response,
        chatId: chatId || externalUserId,
      },
    });
  } catch (error) {
    console.error('[OpenClawWebhook] Error processing message:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /openclaw/pair
 *
 * Pair an external platform user with a Convoe account
 */
router.post('/pair', async (req: Request, res: Response): Promise<void> => {
  try {
    const { platform, externalUserId, convoeUserId, verificationCode } = req.body;

    if (!platform || !externalUserId || !convoeUserId) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
      return;
    }

    // Verify the Convoe user exists
    const convoeUser = await User.findById(convoeUserId);
    if (!convoeUser) {
      res.status(404).json({
        success: false,
        error: 'Convoe user not found',
      });
      return;
    }

    // Update the mapping
    const cacheKey = `${platform}:${externalUserId}`;
    const existingMapping = userMappingCache.get(cacheKey);
    const mapping: ExternalUserMapping = existingMapping || {
      externalPlatform: platform as ExternalUserMapping['externalPlatform'],
      externalUserId,
      createdAt: new Date(),
      lastMessageAt: new Date(),
      verified: false,
    };

    mapping.convoeUserId = convoeUserId;
    mapping.verified = true;
    userMappingCache.set(cacheKey, mapping);

    console.log(`[OpenClawWebhook] Paired ${platform}:${externalUserId} with Convoe user ${convoeUserId}`);

    res.json({
      success: true,
      message: 'Account paired successfully',
    });
  } catch (error) {
    console.error('[OpenClawWebhook] Error pairing account:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /openclaw/status
 *
 * Get OpenClaw integration status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const openclawService = getOpenClawService();

    res.json({
      success: true,
      enabled: openclawService.isEnabled(),
      skills: openclawService.getEnabledSkillNames(),
      mappedUsers: userMappingCache.size,
      activeConversations: conversationCache.size,
    });
  } catch (error) {
    console.error('[OpenClawWebhook] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;
