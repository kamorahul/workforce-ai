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
  private streamingMessageId: string | null = null;
  private streamingMessageUserId: string | null = null; // Cache user ID
  private lastUpdateTime = 0;
  private updateThrottleMs = 50; // Update every 50ms for smooth streaming

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
    try {
      const isKaiChannel = this.channel.id?.indexOf('kai') === 0;
      
      if (isKaiChannel) {
        // ✅ STEP 1: Start AI generation indicator
        await this.channel.sendEvent({
          type: 'ai_indicator.update',
          ai_state: 'AI_STATE_INDICATOR_VISIBLE',
          user: { id: 'kai' },
        });
        console.log('🤖 Started AI typing indicator');
      }
      
    for await (const event of this.assistantStream) {
      await this.handle(event);
      }
      
      if (isKaiChannel) {
        // ✅ STEP 5: Clear AI state when done
        await this.channel.sendEvent({
          type: 'ai_indicator.clear',
          user: { id: 'kai' },
        });
        console.log('✅ Cleared AI state');
      }
    } catch (error) {
      console.error('❌ OpenAIResponseHandler: Error in run():', error);
      
      // Clear AI state on error
      const isKaiChannel = this.channel.id?.indexOf('kai') === 0;
      if (isKaiChannel) {
        try {
          await this.channel.sendEvent({
            type: 'ai_indicator.clear',
            user: { id: 'kai' },
          });
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      throw error;
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
          
          const deltaText = content[0].text?.value ?? '';
          this.message_text += deltaText;
          break;
          
        case 'thread.message.completed':
          const text = this.message_text;
          console.log(`🤖 AI Response: "${text}"`);
          
          const isKaiChannel = this.channel.id?.indexOf('kai') === 0;
          
          if(isKaiChannel) {
            // Simple: Send complete message (NOT silent)
            await this.channel.sendMessage({
              text,
              user: { id: "kai" },
            });
            console.log(`✅ Sent Kai response`);
            
            // Reset for next message
            this.message_text = '';
          } else if(this.messageId) {
            // REGULAR CHANNEL WITH MESSAGE ID - Update original message with task detection
            const { isTask, taskData } = this.parseTaskData(text);
            console.log(`🔍 Task Detection - Response: "${text}" | IsTask: ${isTask}`, taskData ? `| TaskData: ${JSON.stringify(taskData)}` : '');
            
            const originalMessage = await this.chatClient.getMessage(this.messageId);
            const originalText = originalMessage?.message?.text || '';
            
            const extraData: any = {
              istask: isTask ? 1 : 0
            };
            
            if (isTask && taskData) {
              extraData.taskData = taskData;
              console.log(`📝 Saving task data: ${JSON.stringify(taskData)}`);
            }
            
            await this.chatClient.updateMessage({
              id: originalMessage.message.id,
              text: originalMessage.message.text,
              attachments: originalMessage.message.attachments,
              mentioned_users: originalMessage.message.mentioned_users?.map(u => u.id),
              user_id: originalMessage.message.user?.id,
              extraData: extraData
            });
            console.log(`✅ Updated Stream message with istask: ${isTask ? 1 : 0}, preserved text: "${originalText}"`);
            
            // Reset for next message
            this.message_text = '';
            } else {
            // REGULAR CHANNEL WITHOUT MESSAGE ID - Send new message with task detection
            const messageResponse = await this.channel.sendMessage({
                text,
                user_id: this.user.id,
                type: 'system',
                restricted_visibility: [this.user.id],
              });
              
              // Determine if it's a task and update Stream message (only for regular channels)
              if (messageResponse?.message?.id) {
                const { isTask, taskData } = this.parseTaskData(text);
                console.log(`🔍 Task Detection - Response: "${text}" | IsTask: ${isTask}`, taskData ? `| TaskData: ${JSON.stringify(taskData)}` : '');
                
                // Prepare extraData with task information
                const extraData: any = {
                  istask: isTask ? 1 : 0
                };
                
                // If it's a task with JSON data, save the task properties
                if (isTask && taskData) {
                  extraData.taskData = taskData;
                  console.log(`📝 Saving task data: ${JSON.stringify(taskData)}`);
                }
                
                // Update the message with istask field and task data
                await this.chatClient.updateMessage({
                  id: messageResponse.message.id,
                  text: messageResponse.message.text,
                  attachments: messageResponse.message.attachments,
                  mentioned_users: messageResponse.message.mentioned_users?.map(u => u.id),
                  user_id: messageResponse.message.user?.id,
                  extraData: extraData
                });
                console.log(`✅ Updated Stream message with istask: ${isTask ? 1 : 0}`);
              }
            
            // Reset for next message
            this.message_text = '';
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

  private parseTaskData = (text: string): { isTask: boolean; taskData?: any } => {
    const trimmedText = text.trim();
    
    // If response is "0", it's not a task
    if (trimmedText === '0') {
      return { isTask: false };
    }
    
    // Try to parse as JSON - if successful, it's a task with data
    try {
      const taskData = JSON.parse(trimmedText);
      // Validate that it has expected task structure
      if (taskData && (taskData.title || taskData.description || taskData.priority || taskData.subtasks)) {
        return { isTask: true, taskData };
      }
    } catch (error) {
      // Not valid JSON, fall back to original logic
      console.log('Response is not valid JSON, using original task detection logic');
    }
    
    // Fall back to original task detection logic
    return { isTask: this.determineIfTask(text) };
  };

  private handleError = async (error: Error) => {
    throw new Error(`An error occurred while handling: ${error.message}`);
  };
}