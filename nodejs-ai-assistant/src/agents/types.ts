import type { Channel, StreamChat } from 'stream-chat';

export interface AIAgent {
  init(): Promise<void>;
  dispose(): Promise<void>;
  getLastInteraction(): number;
  handleMessage(e: string): Promise<string[] | undefined>;

  chatClient: StreamChat;
  channel: Channel;
}

