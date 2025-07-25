import OpenAI from 'openai';
import { OpenAIResponseHandler } from './OpenAIResponseHandler';
import type { AIAgent } from '../types';
import type { Channel, StreamChat } from 'stream-chat';
import {User} from "../createAgent";

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
    const apiKey = process.env.OPENAI_API_KEY as string | undefined;
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({ apiKey });
    this.assistant = await this.openai.beta.assistants.retrieve(agentId);
    this.openAiThread = await this.openai.beta.threads.create();
  };

  public handleMessage = async (e: string) => {
    console.log("Message Received")
    if (!this.openai || !this.openAiThread || !this.assistant) {
      console.log('OpenAI not initialized');
      return;
    }

    if (!e) {
      console.log('Skip handling ai generated message');
      return;
    }

    const message = e;
    if (!message) return;

    this.lastInteractionTs = Date.now();

    await this.openai.beta.threads.messages.create(this.openAiThread.id, {
      role: "assistant",
      content: `You are a helpful assistant that extracts structured information from user messages.

                ## Extraction Rules:

                - try to understand the conversation and find the expected tasks or calender events

                ## Output Format (always follow this):

                **Upcoming Events**
                - [List events here with time/date and subject]

                **Tasks to Complete**
                - [List tasks here with what needs to be done and any deadlines]

                ## Requirements:
                - Never return "null" or leave sections empty. If nothing is found, say: “You are all good for the day” .
                - Keep all tasks and events user-focused unless clearly about someone else.
      `,
          });

    await this.openai.beta.threads.messages.create(this.openAiThread.id, {
      role: 'user',
      content: message,
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
     );
     void handler.run();
     this.handlers.push(handler);
   } catch (e) {
     console.log("Error: ", e)
   }
  };
}
