import { StreamChat } from 'stream-chat';
import { OpenAIAgent } from './openai/OpenAIAgent';
import { ClaudeAgent } from './claude/ClaudeAgent';
import { apiKey, apiSecret } from '../serverClient';
import { AIAgent, AIProvider, getAIProvider } from './types';

export interface User {
  id: string;
  role: string;
  created_at: Date;
  updated_at: Date;
  last_active: Date;
  last_engaged_at: Date;
  banned: Boolean;
  online: Boolean;
  name: string;
  image: string;
}

/**
 * Create an AI agent with the specified or default provider
 * @param user - The user making the request
 * @param channel_type - Stream channel type
 * @param channel_id - Stream channel ID
 * @param provider - Optional provider override ('openai' | 'claude')
 */
export const createAgent = async (
  user: User,
  channel_type: string,
  channel_id: string,
  provider?: AIProvider
): Promise<AIAgent> => {
  const serverClient = StreamChat.getInstance(apiKey, apiSecret, {
    timeout: 20000,
  });

  const channel = serverClient.channel(channel_type, channel_id);

  // Use provided provider or get from environment
  const selectedProvider = provider || getAIProvider();

  console.log(`Creating AI agent with provider: ${selectedProvider}`);

  switch (selectedProvider) {
    case 'claude':
      return new ClaudeAgent(serverClient, channel, user);
    case 'openai':
    default:
      return new OpenAIAgent(serverClient, channel, user);
  }
};
