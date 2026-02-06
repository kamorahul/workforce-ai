/**
 * Telegram Bot Service
 *
 * Direct Telegram integration using grammy library.
 * Routes messages through the OpenClaw service for task/event creation.
 */

import { Bot, Context } from 'grammy';
import Anthropic from '@anthropic-ai/sdk';
import { getOpenClawService } from './openclaw';
import { SkillContext } from './openclaw/types';

// Conversation history cache
const conversationCache = new Map<number, Array<{ role: 'user' | 'assistant'; content: string }>>();

// System prompt for Telegram users
const TELEGRAM_SYSTEM_PROMPT = `You are Kai, a friendly and intelligent personal assistant for Convoe - a team collaboration app. Users are messaging you from Telegram.

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

let bot: Bot | null = null;
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

/**
 * Process message with AI and OpenClaw skills
 */
async function processMessage(
  userId: number,
  text: string,
  displayName: string
): Promise<string> {
  const client = getAnthropic();
  const openclawService = getOpenClawService();

  // Get available tools
  const tools = openclawService.getClaudeToolDefinitions();

  const today = new Date().toISOString().split('T')[0];
  const systemPrompt = `${TELEGRAM_SYSTEM_PROMPT}\n\nToday is ${today}. User: ${displayName}`;

  // Build skill context
  const skillContext: SkillContext = {
    userId: `telegram_${userId}`,
    timezone: 'UTC',
  };

  // Get conversation history
  let history = conversationCache.get(userId) || [];
  history.push({ role: 'user', content: text });

  try {
    // Make API call
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: history.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      tools: tools.length > 0 ? tools : undefined,
    });

    let finalResponse = '';

    // Handle tool use
    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`[TelegramBot] Executing tool: ${block.name}`);
          const result = await openclawService.executeSkill(
            block.name,
            block.input,
            skillContext
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Continue with tool results
      const followUp = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...history.slice(-8).map((msg) => ({
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
      finalResponse = textBlocks.map((block) => block.text).join('\n');
    } else {
      // Extract text response
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      finalResponse = textBlocks.map((block) => block.text).join('\n');
    }

    // Update history
    history.push({ role: 'assistant', content: finalResponse });
    if (history.length > 20) {
      history = history.slice(-20);
    }
    conversationCache.set(userId, history);

    return finalResponse;
  } catch (error) {
    console.error('[TelegramBot] Error processing message:', error);
    return "Sorry, I encountered an error. Please try again.";
  }
}

/**
 * Initialize and start the Telegram bot
 */
export function startTelegramBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log('[TelegramBot] TELEGRAM_BOT_TOKEN not set, skipping bot initialization');
    return null;
  }

  // Stop OpenClaw gateway's Telegram polling to avoid conflicts
  console.log('[TelegramBot] Starting Telegram bot...');

  bot = new Bot(token);

  // Handle /start command
  bot.command('start', async (ctx: Context) => {
    const name = ctx.from?.first_name || 'there';
    await ctx.reply(
      `Hey ${name}! 👋 I'm Kai, your personal assistant.\n\n` +
      `I can help you with:\n` +
      `📝 Creating tasks\n` +
      `📅 Scheduling events\n` +
      `✅ Checking your tasks\n` +
      `🗓 Viewing your calendar\n\n` +
      `Just tell me what you need!`
    );
  });

  // Handle /help command
  bot.command('help', async (ctx: Context) => {
    await ctx.reply(
      `Here's what I can do:\n\n` +
      `📝 **Tasks**\n` +
      `• "Create a task to review docs"\n` +
      `• "Add a high priority task for tomorrow"\n` +
      `• "What are my tasks?"\n\n` +
      `📅 **Events**\n` +
      `• "Schedule a meeting for tomorrow at 2pm"\n` +
      `• "Remind me to call mom at 5pm"\n` +
      `• "What's on my calendar?"\n\n` +
      `Just type naturally - I'll understand!`,
      { parse_mode: 'Markdown' }
    );
  });

  // Handle all text messages
  bot.on('message:text', async (ctx: Context) => {
    const userId = ctx.from?.id;
    const text = ctx.message?.text;
    const displayName = ctx.from?.first_name || 'User';

    if (!userId || !text) return;

    console.log(`[TelegramBot] Message from ${displayName} (${userId}): ${text.substring(0, 50)}...`);

    // Show typing indicator
    await ctx.replyWithChatAction('typing');

    try {
      const response = await processMessage(userId, text, displayName);
      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('[TelegramBot] Error:', error);
      await ctx.reply("Sorry, something went wrong. Please try again.");
    }
  });

  // Error handler
  bot.catch((err: Error) => {
    console.error('[TelegramBot] Bot error:', err);
  });

  // Start the bot
  bot.start({
    onStart: (botInfo: { username: string }) => {
      console.log(`[TelegramBot] Bot started: @${botInfo.username}`);
    },
  });

  return bot;
}

/**
 * Stop the Telegram bot
 */
export function stopTelegramBot(): void {
  if (bot) {
    bot.stop();
    bot = null;
    console.log('[TelegramBot] Bot stopped');
  }
}

/**
 * Get bot instance
 */
export function getTelegramBot(): Bot | null {
  return bot;
}
