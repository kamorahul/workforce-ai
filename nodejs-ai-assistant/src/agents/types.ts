import type { Channel, StreamChat } from 'stream-chat';

export interface AIAgent {
  init(agentId: string): Promise<void>;
  dispose(): Promise<void>;
  getLastInteraction(): number;
  handleMessage(e: string, messageId?: string): Promise<void>;

  chatClient: StreamChat;
  channel: Channel;
}

