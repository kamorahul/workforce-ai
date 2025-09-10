import OpenAI from 'openai';
import { OpenAIResponseHandler } from './OpenAIResponseHandler';
import type { AIAgent } from '../types';
import type { Channel, StreamChat } from 'stream-chat';
import {User} from "../createAgent";
import { Thread } from '../../models/Thread';

export class OpenAIAgent implements AIAgent {
  private openai?: OpenAI;
  private assistant?: OpenAI.Beta.Assistants.Assistant;
  private openAiThread?: OpenAI.Beta.Threads.Thread;
  private lastInteractionTs = Date.now();

  private handlers: OpenAIResponseHandler[] = [];

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
    console.log("=== Assistant Init Debug ===");
    console.log("Initializing assistant with ID:", agentId);
    
    const apiKey = process.env.OPENAI_API_KEY as string | undefined;
    if (!apiKey) {
      console.error('OpenAI API key is missing');
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({ apiKey });
  
    this.assistant = await this.openai.beta.assistants.retrieve(agentId);
    
    // Check if thread already exists for this channel and user
    const existingThread = await Thread.findOne({ 
      channelId: this.channel.id, 
      userId: this.user.id 
    });
    
    if (existingThread) {
      this.openAiThread = await this.openai.beta.threads.retrieve(existingThread.openAiThreadId);
      console.log("Using existing thread:", existingThread.openAiThreadId);
    } else {
      // Create new thread
      this.openAiThread = await this.openai.beta.threads.create();
      
      // Save thread mapping to MongoDB
      const threadRecord = new Thread({
        channelId: this.channel.id,
        openAiThreadId: this.openAiThread.id,
        userId: this.user.id
      });
      await threadRecord.save();
      console.log("Created new thread and saved to MongoDB:", this.openAiThread.id);
    }
  };

  public handleMessage = async (e: string, messageId?: string) => {
    if (!this.openai || !this.openAiThread || !this.assistant) {
      console.error('OpenAI not initialized');
      return;
    }

    if (!e) {
      return;
    }

    this.lastInteractionTs = Date.now();

    // Check if this is a kai user/channel to use different system prompt
    const isKaiUser = this.user.id === 'kai' || this.channel.id?.indexOf('kai') === 0;
    
    if (isKaiUser) {
      // Original system prompt for kai users
      await this.openai.beta.threads.messages.create(this.openAiThread.id, {
        role: "assistant",
        content: `You are a helpful assistant that extracts structured information from user messages.

                  ## Extraction Rules:

                  - try to understand the conversation and find the expected tasks or calender events

                  ## Output Format (always follow this):

                  *Upcoming Events*
                  - [List events here with time/date and subject]

                  *Tasks to Complete*
                  - [List tasks here with what needs to be done and any deadlines]

                  ## Requirements:
                  - Never return "null" or leave sections empty. If nothing is found, say: "You are all good for the day" .
                  - Keep all tasks and events user-focused unless clearly about someone else.
        `,
      });
    } else {
      // Simple 1 or 0 response for regular users
      await this.openai.beta.threads.messages.create(this.openAiThread.id, {
        role: "assistant",
        content: `You are a task detection assistant. Analyze the given message and determine if it contains any task, todo, deadline, or actionable item. 

                  ## Requirements:
                  - Respond with only '1' if the message contains a task, todo, deadline, or actionable item
                  - Respond with only '0' if the message does not contain any tasks
                  - Be precise and only respond with 1 or 0
                  - Do not include any other text or explanation
        `,
      });
    }

    await this.openai.beta.threads.messages.create(this.openAiThread.id, {
      role: 'user',
      content: e,
    });

    try {
      const run = this.openai.beta.threads.runs.stream(this.openAiThread.id, {
        assistant_id: this.assistant.id,
      });

      const handler = new OpenAIResponseHandler(
        this.openai,
        this.openAiThread,
        run,
        this.chatClient,
        this.channel,
        this.user,
        messageId,
      );
      
      void handler.run();
      this.handlers.push(handler);
    } catch (error) {
      console.error("Error in handleMessage:", error);
    }
  };
}