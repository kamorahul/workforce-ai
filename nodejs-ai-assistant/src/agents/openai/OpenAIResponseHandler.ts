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

  run = async () => {
    for await (const event of this.assistantStream) {
      await this.handle(event);
    }
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
  ) => {
    try {
      // Retrieve events that are denoted with 'requires_action'
      // since these will have our tool_calls
      switch (event.event) {
        case 'thread.run.requires_action':
          console.log('Requires action');
          await this.handleRequiresAction(
            event.data,
            event.data.id,
            event.data.thread_id,
          );
          break;
        case 'thread.message.delta':
          const content = event.data.delta.content;
          if (!content || content[0]?.type !== 'text') return;
          this.message_text += content[0].text?.value ?? '';
          break;
        case 'thread.message.completed':
          const text = this.message_text;
          await this.channel.sendMessage({
            text,
            user_id: this.user.id,
            type: 'system',
            restricted_visibility: [this.user.id],
          });
          break;
        case 'thread.run.step.created':
          this.run_id = event.data.id;
          break;
      }
    } catch (error) {
      console.error('Error handling event:', error);
    }
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
            console.log(messages)
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
        await this.handle(event);
      }
    } catch (error) {
      console.error('Error submitting tool outputs:', error);
      await this.handleError(error as Error);
    }
  };

  private getGroupConversationsByDate = async (
    args: FetchGroupConversationArguments,
  ) => {
    console.log(new Date(args.date));
    const page1 = await this.chatClient.search(
      { cid: 'team:random' },
      { created_at: { $gte: new Date(args.date).toISOString() } },
      {
        sort: [{ updated_at: 1 }],
        limit: 100,
      },
    );

    return page1.results.map(({ message }) => {
      return `${message.user?.name}: ${message.text}`;
    });
  };

  private handleError = async (error: Error) => {
    throw new Error(`An error occurred while handling: ${error.message}`);
  };
}
