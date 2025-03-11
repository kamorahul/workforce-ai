import { StreamChat } from 'stream-chat';
import { OpenAIAgent } from './openai/OpenAIAgent';
import {apiKey, apiSecret} from '../serverClient';
import {AIAgent} from "./types";

export interface User {
    id: string
    role: string,
    created_at: Date,
    updated_at: Date,
    last_active: Date,
    last_engaged_at: Date,
    banned: Boolean,
    online: Boolean,
    name: string,
    image: string
}

export const createAgent = async (
  user: User,
  channel_type: string,
  channel_id: string,
): Promise<AIAgent> => {
  const serverClient = StreamChat.getInstance(apiKey, apiSecret, {
    timeout: 20000
  });


  const channel = serverClient.channel(channel_type, channel_id);

  return new OpenAIAgent(serverClient, channel, user);
};
