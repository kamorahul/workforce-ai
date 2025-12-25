import type { Channel, StreamChat } from 'stream-chat';

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

