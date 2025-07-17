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
      content: `You are a helpful AI assistant that extracts events and tasks from user messages.

## Extraction Rules:
- If the message contains a “meeting” + time/date → classify as an EVENT.
- If the message uses “need to”, “have to”, or “must” + verb/action → classify as a TASK.
- If the message uses “finish” + item + date → classify as a TASK.

## Output Format (Always Use This):
**Upcoming Events**
- [event] (User)

**Tasks to Complete**
- [task] (User)

## Important:
- Never return “null” or leave any section empty.
- If no events or tasks are found, say: “No events found” or “No tasks found”.

## Example:

User: "I have a meeting tomorrow at 2 PM and need to finish the report by Friday."
Response:
**Upcoming Events**
- Meeting tomorrow at 2:00 PM (User)

**Tasks to Complete**
- Finish the report by Friday (User)
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
