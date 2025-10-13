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
    
    let threadToUse = this.openAiThread;
    let additionalInstructions = '';
    
    if (isKaiUser) {
      // FOR KAI: Create a temporary thread with ONLY recent GetStream conversations
      // This ensures the AI only sees fresh data, not old accumulated messages
      
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // Step 1: Get all user's channels
        const channels = await this.chatClient.queryChannels({
          members: { $in: [this.user.id] },
        });
        
        let recentMessages: string[] = [];
        
        // Step 2: Fetch recent messages from each channel
        for (const channel of channels) {
          // Skip the kai channel itself (don't analyze Kai's own summaries!)
          if (channel.id?.indexOf('kai') === 0) continue;
          
          const result = await channel.query({
            messages: {
              created_at_after_or_equal: sevenDaysAgo.toISOString(),
              limit: 100,
            },
          });
          
          // Step 3: Format messages with dates
          const formatted = result.messages
            .filter(msg => msg.type !== 'system' && msg.user?.name && msg.created_at)
            .map(msg => {
              const date = new Date(msg.created_at!).toISOString().split('T')[0];
              return `[${date}] ${msg.user?.name}: ${msg.text}`;
            });
          
          recentMessages.push(...formatted);
        }
        
        console.log(`📅 Fetched ${recentMessages.length} recent messages from ${channels.length} channels for daily summary`);
        
        // Step 4: Create a TEMPORARY thread (will be discarded after response)
        const tempThread = await this.openai.beta.threads.create();
        threadToUse = tempThread;
        
        const today = new Date().toISOString().split('T')[0];
        
        // Step 5: Add ONLY recent conversations to temp thread
        if (recentMessages.length > 0) {
          const context = recentMessages.join('\n');
          await this.openai.beta.threads.messages.create(tempThread.id, {
            role: 'user',
            content: `Today is ${today}. Here are the recent conversations from the last 7 days:\n\n${context}\n\nPlease provide a daily summary for ${this.user.name}.`,
          });
        } else {
          await this.openai.beta.threads.messages.create(tempThread.id, {
            role: 'user',
            content: `Today is ${today}. No recent conversations found. Greet ${this.user.name} and let them know all is good.`,
          });
        }
        
        additionalInstructions = `Analyze these conversations and extract events/tasks. Remember dates in messages are relative to when they were sent, not today (${today}).`;
        
      } catch (error) {
        console.error('❌ Error fetching recent messages:', error);
        // Fallback: use main thread
        await this.openai.beta.threads.messages.create(this.openAiThread.id, {
          role: 'user',
          content: e,
        });
        const today = new Date().toISOString().split('T')[0];
        additionalInstructions = `Today is ${today}. Analyze recent conversations and provide a daily summary.`;
      }
    } else {
      // FOR REGULAR USERS: Use main thread normally
      await this.openai.beta.threads.messages.create(this.openAiThread.id, {
        role: 'user',
        content: e,
      });
      additionalInstructions = `Analyze this message and respond with only '1' if it contains a task/todo/deadline, or '0' if it does not. Be precise.`;
    }

    try {
      const run = this.openai.beta.threads.runs.stream(threadToUse.id, {
        assistant_id: this.assistant.id,
        additional_instructions: additionalInstructions,
      });

      const handler = new OpenAIResponseHandler(
        this.openai,
        threadToUse,
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