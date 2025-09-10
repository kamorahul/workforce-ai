import OpenAI from 'openai';
import type { AssistantStream } from 'openai/lib/AssistantStream';
import type {Channel, DefaultGenerics, MessageResponse, StreamChat} from 'stream-chat';
import {User} from "../createAgent";

interface FetchGroupConversationArguments {
  groupId: string;
  date: string;
}

interface FetchUserConversationsArguments {
  username: string;
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
    private readonly messageId?: string,
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
          console.log(`🤖 AI Response: "${text}"`);
          if(this.messageId) {
            // Only update extraData with istask, don't change the message text
            const istask = this.determineTaskStatus(text);
            console.log(`🔍 Task Detection - Response: "${text}" | IsTask: ${istask}`);
            
            await this.chatClient.updateMessage({
              id: this.messageId,
              user_id: this.user.id,
              extraData: {
                istask: istask ? 1 : 0
              }
            });
            console.log(`✅ Updated Stream message with istask: ${istask ? 1 : 0}`);
          } else {
            let messageResponse;
            if(this.channel.id?.indexOf('kai') === 0) {
              messageResponse = await this.channel.sendMessage({
                text,
                user: { id: "kai" },
              });
            } else {
              messageResponse = await this.channel.sendMessage({
                text,
                user_id: this.user.id,
                type: 'system',
                restricted_visibility: [this.user.id],
              });
            }
            
            // Determine if it's a task and update Stream message
            if (messageResponse?.message?.id) {
              const istask = this.determineTaskStatus(text);
              console.log(`🔍 Task Detection - Response: "${text}" | IsTask: ${istask}`);
              
              // Update the message with istask field
              await this.chatClient.updateMessage({
                id: messageResponse.message.id,
                user_id: this.user.id,
                extraData: {
                  istask: istask ? 1 : 0
                }
              });
              console.log(`✅ Updated Stream message with istask: ${istask ? 1 : 0}`);
            }
          }

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
            const argumentsString = toolCall.function.arguments;
            console.log('toolCall: ', toolCall.function.name);

            switch (toolCall.function.name){
              case 'fetch_group_conversation' :
                const args = JSON.parse(
                    argumentsString,
                ) as FetchGroupConversationArguments;
                const groupMessages = await this.getGroupConversationsByDate(args);
                return {
                  tool_call_id: toolCall.id,
                  output: groupMessages.join(", "),
                };
                break;

              case 'fetch_user_conversations' :
                const getUserConversationsArgs = JSON.parse(
                    argumentsString,
                ) as FetchUserConversationsArguments;
                const userMessages = await this.getUserConversationsByLimit(getUserConversationsArgs);

                console.log("userMessages: ", userMessages);
                

                return {
                  tool_call_id: toolCall.id,
                  output: userMessages?.join(", "),
                };
                break;

              default:
                return
            }


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
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 2);
    sevenDaysAgo.setUTCHours(0,0,0,0);

    const channel = this.chatClient.channel("messaging", args.groupId)
    const page1 = await channel.query({
      messages: { limit: 100, created_at_after_or_equal:  sevenDaysAgo.toISOString() }
    });

    return page1.messages.filter(
        (message) => message.type !== "system"
    ).map((message) => {
      return `${message.user?.name}: ${message.text}`;
    });
  };

  private getUserConversationsByLimit = async (
    args: FetchUserConversationsArguments,
  ) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const channels = await this.chatClient.queryChannels({
      members: { $in: [args.username] },
    });

    // Step 2: Query messages from each channel
    let allMessages: MessageResponse<DefaultGenerics>[] = [];

    for (const channel of channels) {
      const result = await channel.query({
        messages: {
          created_at_after_or_equal: sevenDaysAgo.toISOString(),
          limit: 200,
        },
      });

      allMessages = [...allMessages, ...result.messages];
    }

    return allMessages.filter(
        (message) => (message.type !== "system" && message.user?.name)
    ).map((message) => {
      return `${message.user?.name}: ${message.text}`;
    });
    }

  private determineIfTask = (text: string): boolean => {
    // Check if this is a kai user/channel response (structured format)
    const isKaiUser = this.user.id === 'kai' || this.channel.id?.indexOf('kai') === 0;
    
    if (isKaiUser) {
      // For kai users, look for task indicators in the structured response
      const taskKeywords = [
        'task', 'todo', 'deadline', 'due', 'complete', 'finish', 'assign',
        'schedule', 'meeting', 'appointment', 'reminder', 'urgent', 'priority',
        'project', 'work', 'action item', 'follow up', 'checklist'
      ];
      
      const lowerText = text.toLowerCase();
      return taskKeywords.some(keyword => lowerText.includes(keyword));
    } else {
      // For regular users, parse simple 1 or 0 response
      const trimmedText = text.trim();
      return trimmedText === '1';
    }
  };

  private determineTaskStatus = (text: string): boolean => {
    return this.determineIfTask(text);
  };

  private handleError = async (error: Error) => {
    throw new Error(`An error occurred while handling: ${error.message}`);
  };
}