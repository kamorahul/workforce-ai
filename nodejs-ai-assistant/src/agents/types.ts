import type { Channel, StreamChat } from 'stream-chat';

export type AIProvider = 'openai' | 'claude';

export interface MentionedUser {
  id: string;
  name: string;
}

/**
 * Timezone context sent by the mobile app with user messages
 * Used for proper timezone handling when creating events/tasks
 */
export interface TimezoneContext {
  /** User's timezone identifier (e.g., "Asia/Kolkata", "America/New_York") */
  timezone: string;
  /** User's current local time in ISO format */
  localTime: string;
  /** Timezone offset in minutes */
  offsetMinutes: number;
  /** Formatted offset string (e.g., "+05:30", "-08:00") */
  offsetString: string;
  /** Abbreviated timezone name (e.g., "IST", "PST") */
  abbreviation: string;
}

export interface AIAgent {
  init(agentId: string): Promise<void>;
  dispose(): Promise<void>;
  getLastInteraction(): number;
  handleMessage(
    e: string,
    messageId?: string,
    attachments?: any[],
    usePersistentThread?: boolean,
    mentionedUsers?: MentionedUser[],
    timezoneContext?: TimezoneContext
  ): Promise<void>;

  chatClient: StreamChat;
  channel: Channel;
}

/**
 * Get the current AI provider from environment or default
 * Default is now 'claude' - set AI_PROVIDER=openai to use OpenAI
 */
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === 'openai' || provider === 'gpt') {
    return 'openai';
  }
  // Default to Claude
  return 'claude';
}

