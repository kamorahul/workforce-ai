import OpenAI from 'openai';
import type { AssistantStream } from 'openai/lib/AssistantStream';
import type {Channel, DefaultGenerics, MessageResponse, StreamChat} from 'stream-chat';
import {User} from "../createAgent";
import { Task } from '../../models/Task';
import { Event } from '../../models/Event';

interface FetchGroupConversationArguments {
  groupId: string;
  date: string;
}

interface FetchUserConversationsArguments {
  username: string;
}

interface CreateTaskArguments {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  assignees?: string[];
}

interface CreateEventArguments {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  location?: string;
  attendees?: string[];
  reminder?: number;
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
          // this.message_text += deltaText;
          this.message_text = (this.message_text ?? '') + deltaText;
          console.log(`🤖 AI Response: "${this.message_text}"`);
          break;
          
        case 'thread.message.completed':
          const text = this.message_text?.trim() || '';
          console.log(`🤖 AI Response: "${text}"`);
          
          // ⚠️ Safety check: Don't send empty messages
          if (!text || text.length === 0) {
            console.warn('⚠️ Skipping empty message');
            this.message_text = '';
            break;
          }
          
          const isKaiChannel = this.channel.id?.indexOf('kai') === 0;
          
          if(isKaiChannel) {
            // Simple: Send complete message with ai_generated flag
            await this.channel.sendMessage({
              text,
              user: { id: "kai" },
              ai_generated: true,  // ✅ GetStream's official AI flag
            });
            console.log(`✅ Sent Kai response`);
            
            // Reset for next message
            this.message_text = '';
          } else if(this.messageId) {
            // REGULAR CHANNEL WITH MESSAGE ID - Update original message with task/event detection
            const { isTask, isEvent, taskData, eventData } = this.parseTaskData(text);
            console.log(`🔍 Classification - IsTask: ${isTask} | IsEvent: ${isEvent}`);

            const originalMessage = await this.chatClient.getMessage(this.messageId);
            const originalText = originalMessage?.message?.text || '';

            const extraData: any = {
              istask: isTask ? 1 : 0,
              isevent: isEvent ? 1 : 0
            };

            if (isTask && taskData) {
              extraData.taskData = taskData;
              console.log(`📝 Saving task data: ${JSON.stringify(taskData)}`);
            }

            if (isEvent && eventData) {
              extraData.eventData = eventData;
              console.log(`📅 Saving event data: ${JSON.stringify(eventData)}`);
            }

            await this.chatClient.updateMessage({
              id: originalMessage.message.id,
              text: originalMessage.message.text,
              attachments: originalMessage.message.attachments,
              mentioned_users: originalMessage.message.mentioned_users?.map(u => u.id),
              user_id: originalMessage.message.user?.id,
              extraData: extraData
            });
            console.log(`✅ Updated message - istask: ${isTask ? 1 : 0}, isevent: ${isEvent ? 1 : 0}`);

            // Reset for next message
            this.message_text = '';
          } else {
            // REGULAR CHANNEL WITHOUT MESSAGE ID - Send new message with task/event detection
            const messageResponse = await this.channel.sendMessage({
              text,
              user_id: this.user.id,
              type: 'system',
              restricted_visibility: [this.user.id],
            });

            // Determine if it's a task/event and update Stream message
            if (messageResponse?.message?.id) {
              const { isTask, isEvent, taskData, eventData } = this.parseTaskData(text);
              console.log(`🔍 Classification - IsTask: ${isTask} | IsEvent: ${isEvent}`);

              const extraData: any = {
                istask: isTask ? 1 : 0,
                isevent: isEvent ? 1 : 0
              };

              if (isTask && taskData) {
                extraData.taskData = taskData;
                console.log(`📝 Saving task data: ${JSON.stringify(taskData)}`);
              }

              if (isEvent && eventData) {
                extraData.eventData = eventData;
                console.log(`📅 Saving event data: ${JSON.stringify(eventData)}`);
              }

              await this.chatClient.updateMessage({
                id: messageResponse.message.id,
                text: messageResponse.message.text,
                attachments: messageResponse.message.attachments,
                mentioned_users: messageResponse.message.mentioned_users?.map(u => u.id),
                user_id: messageResponse.message.user?.id,
                extraData: extraData
              });
              console.log(`✅ Updated message - istask: ${isTask ? 1 : 0}, isevent: ${isEvent ? 1 : 0}`);
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

              case 'create_task':
                const createTaskArgs = JSON.parse(argumentsString) as CreateTaskArguments;
                const taskResult = await this.createTask(createTaskArgs);
                return {
                  tool_call_id: toolCall.id,
                  output: JSON.stringify(taskResult),
                };

              case 'create_event':
                const createEventArgs = JSON.parse(argumentsString) as CreateEventArguments;
                const eventResult = await this.createEvent(createEventArgs);
                return {
                  tool_call_id: toolCall.id,
                  output: JSON.stringify(eventResult),
                };

              default:
                console.log('Unknown tool call:', toolCall.function.name);
                return {
                  tool_call_id: toolCall.id,
                  output: 'Unknown function',
                };
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

  // Create a new task via Kai command
  private createTask = async (args: CreateTaskArguments): Promise<{ success: boolean; task?: any; error?: string }> => {
    try {
      console.log('📝 Creating task via Kai:', args.title);

      const task = new Task({
        name: args.title,
        description: args.description || '',
        priority: args.priority || 'medium',
        completionDate: args.dueDate ? new Date(args.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
        assignee: args.assignees || [this.user.id],
        createdBy: this.user.id,
        channelId: this.channel.id,
        status: 'todo',
        completed: false,
      });

      await task.save();
      console.log('✅ Task created:', task._id);

      return {
        success: true,
        task: {
          id: task._id,
          title: task.name,
          priority: task.priority,
          dueDate: task.completionDate,
          assignees: task.assignee,
        }
      };
    } catch (error) {
      console.error('❌ Error creating task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task'
      };
    }
  }

  // Create a new event via Kai command
  private createEvent = async (args: CreateEventArguments): Promise<{ success: boolean; event?: any; error?: string }> => {
    try {
      console.log('📅 Creating event via Kai:', args.title);

      const event = new Event({
        title: args.title,
        description: args.description || '',
        startDate: new Date(args.startDate),
        endDate: args.endDate ? new Date(args.endDate) : null,
        location: args.location || '',
        attendees: args.attendees || [this.user.id],
        organizer: this.user.id,
        channelId: this.channel.id,
        status: 'scheduled',
        reminder: args.reminder || 15,
      });

      await event.save();
      console.log('✅ Event created:', event._id);

      return {
        success: true,
        event: {
          id: event._id,
          title: event.title,
          startDate: event.startDate,
          endDate: event.endDate,
          location: event.location,
          attendees: event.attendees,
        }
      };
    } catch (error) {
      console.error('❌ Error creating event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create event'
      };
    }
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

  private parseTaskData = (text: string): { isTask: boolean; isEvent: boolean; taskData?: any; eventData?: any } => {
    const trimmedText = text.trim();

    // If response is "0", it's not a task or event
    if (trimmedText === '0') {
      return { isTask: false, isEvent: false };
    }

    // Try to parse as JSON - new classification format
    try {
      const data = JSON.parse(trimmedText);

      // New format: { type: "task" | "event" | "none", ... }
      if (data && data.type) {
        switch (data.type) {
          case 'task':
            console.log('📝 Detected TASK:', data.title);
            return {
              isTask: true,
              isEvent: false,
              taskData: {
                title: data.title,
                description: data.description,
                priority: data.priority || 'medium',
                dueDate: data.dueDate,
                assignees: data.assignees,
                subtasks: data.subtasks
              }
            };

          case 'event':
            console.log('📅 Detected EVENT:', data.title);
            return {
              isTask: false,
              isEvent: true,
              eventData: {
                title: data.title,
                description: data.description,
                startDate: data.startDate,
                endDate: data.endDate,
                location: data.location,
                attendees: data.attendees,
                reminder: data.reminder || 15
              }
            };

          case 'none':
            return { isTask: false, isEvent: false };
        }
      }

      // Legacy format: { title, priority, ... } without type
      if (data && (data.title || data.description || data.priority || data.subtasks)) {
        return { isTask: true, isEvent: false, taskData: data };
      }
    } catch (error) {
      // Not valid JSON, fall back to original logic
      console.log('Response is not valid JSON, using original task detection logic');
    }

    // Fall back to original task detection logic
    return { isTask: this.determineIfTask(text), isEvent: false };
  };

  private handleError = async (error: Error) => {
    throw new Error(`An error occurred while handling: ${error.message}`);
  };
}