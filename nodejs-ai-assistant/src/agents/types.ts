import type { Channel, StreamChat } from 'stream-chat';

export type AIProvider = 'openai' | 'claude';

export interface MentionedUser {
  id: string;
  name: string;
}

export interface AIAgent {
  init(agentId: string): Promise<void>;
  dispose(): Promise<void>;
  getLastInteraction(): number;
  handleMessage(e: string, messageId?: string, attachments?: any[], usePersistentThread?: boolean, mentionedUsers?: MentionedUser[]): Promise<void>;

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

