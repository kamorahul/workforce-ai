import OpenAI from 'openai';
import type { AssistantStream } from 'openai/lib/AssistantStream';
import type { Channel, StreamChat } from 'stream-chat';
import {User} from "../createAgent";

interface FetchGroupConversationArguments {
  groupId: string;
  date: string;
}

export class OpenAIResponseHandler {
  private message_text = '';
  private run_id = '';

  constructor(
    private readonly openai: OpenAI,
    private readonly openAiThread: OpenAI.Beta.Threads.Thread,
    private readonly assistantStream: AssistantStream,
    private readonly chatClient: StreamChat,
    private readonly channel: Channel,
    private readonly user: User,
  ) {
    this.chatClient.on('ai_indicator.stop', this.handleStopGenerating);
  }

  run = async (): Promise<string[] | undefined> => {
    console.log("Running OpenAI Response");
    const replies = []
    for await (const event of this.assistantStream) {
      console.log('Received event', event);
      const reply = await this.handle(event);
      if (reply) {
        replies.push(reply);
      }
    }
    console.log('Replies: ', replies);
    return replies;
  };

  dispose = () => {
    this.chatClient.off('ai_indicator.stop', this.handleStopGenerating);
  };

  private handleStopGenerating = async () => {
    console.log('Stop generating');
    if (!this.openai || !this.openAiThread) {
      console.log('OpenAI not initialized');
      return;
    }

    this.openai.beta.threads.runs.cancel(this.openAiThread.id, this.run_id);
  };

  private handle = async (
    event: OpenAI.Beta.Assistants.AssistantStreamEvent,
  ): Promise<string> => {
      return new Promise(async (resolve, reject) => {
        try {
        switch (event.event) {
          case 'thread.run.requires_action':
            await this.handleRequiresAction(
                event.data,
                event.data.id,
                event.data.thread_id,
            );
            break;
          case 'thread.message.delta':
            const content = event.data.delta.content;
            if (!content || content[0]?.type !== 'text') return;
            console.log('Partial Response:', content[0].text?.value);

            this.message_text += content[0].text?.value ?? '';
            break;
          case 'thread.message.completed':
            const text = this.message_text;
            console.log('Response Compiled:', text);
            resolve(text);
            break;
          case 'thread.run.step.created':
            this.run_id = event.data.id;
            break;
        }
      } catch (error) {
      console.error('Error handling event:', error);
      reject(error);
    }
      })
      // Retrieve events that are denoted with 'requires_action'
      // since these will have our tool_calls

  };

  private handleRequiresAction = async (
    data: OpenAI.Beta.Threads.Runs.Run,
    runId: string,
    threadId: string,
  ) => {
    if (!data.required_action || !data.required_action.submit_tool_outputs) {
      console.log('No tool outputs to submit');
      return;
    }
    try {
      const toolOutputs = await Promise.all(
        data.required_action.submit_tool_outputs.tool_calls.map(
          async (toolCall) => {
            if (toolCall.function.name !== 'fetch_group_conversation') return;

            const argumentsString = toolCall.function.arguments;
            console.log('Arguments: ', argumentsString);
            const args = JSON.parse(
              argumentsString,
            ) as FetchGroupConversationArguments;
            const messages = await this.getGroupConversationsByDate(args);
            return {
              tool_call_id: toolCall.id,
              output: messages.join(", "),
            };
          },
        ),
      );
      // Submit all the tool outputs at the same time
      await this.submitToolOutputs(
        toolOutputs.filter((t) => !!t),
        runId,
        threadId,
      );
    } catch (error) {
      console.error('Error processing required action:', error);
      this.openai.beta.threads.runs.cancel(threadId, runId);
      await this.handleError(error as Error);
    }
  };

  private submitToolOutputs = async (
    toolOutputs: { output: string; tool_call_id: string }[],
    runId: string,
    threadId: string,
  ) => {
    try {
      // Use the submitToolOutputsStream helper
      const stream = this.openai.beta.threads.runs.submitToolOutputsStream(
        threadId,
        runId,
        { tool_outputs: toolOutputs },
      );
      for await (const event of stream) {
        const res = await this.handle(event);
      }
    } catch (error) {
      console.error('Error submitting tool outputs:', error);
      await this.handleError(error as Error);
    }
  };

  private getGroupConversationsByDate = async (
    args: FetchGroupConversationArguments,
  ) => {
    const channel = this.chatClient.channel("messaging", args.groupId)
    const page1 = await channel.query({
      messages: { limit: 100, created_at_after_or_equal:  new Date(args.date).toISOString() }
    });

    return page1.messages.filter(
        (message) => message.type !== "system"
    ).map((message) => {
      return `${message.user?.name}: ${message.text}`;
    });
  };

  private handleError = async (error: Error) => {
    throw new Error(`An error occurred while handling: ${error.message}`);
  };
}
