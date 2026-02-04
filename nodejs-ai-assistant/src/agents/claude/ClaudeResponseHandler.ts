import Anthropic from '@anthropic-ai/sdk';
import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';
import type { Channel, DefaultGenerics, MessageResponse, StreamChat } from 'stream-chat';
import { User } from '../createAgent';
import { Task } from '../../models/Task';
import { Event } from '../../models/Event';
import { AssistantType } from '../../config/prompts';

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

interface MentionedUser {
  id: string;
  name: string;
}

type MessageContent = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: MessageContent;
}

export class ClaudeResponseHandler {
  private messageText = '';
  private toolUseBlocks: Anthropic.ToolUseBlock[] = [];

  constructor(
    private readonly anthropic: Anthropic,
    private readonly messageStream: MessageStream,
    private readonly chatClient: StreamChat,
    private readonly channel: Channel,
    private readonly user: User,
    private readonly messageId?: string,
    private readonly mentionedUsers?: MentionedUser[],
    private readonly assistantType?: AssistantType,
    private readonly conversationHistory?: ConversationMessage[],
    private readonly systemPrompt?: string,
    private readonly tools?: any[]
  ) {
    this.chatClient.on('ai_indicator.stop', this.handleStopGenerating);
  }

  run = async () => {
    try {
      const isKaiChannel = this.channel.id?.indexOf('kai') === 0;

      if (isKaiChannel) {
        // Start AI generation indicator
        await this.channel.sendEvent({
          type: 'ai_indicator.update',
          ai_state: 'AI_STATE_INDICATOR_VISIBLE',
          user: { id: 'kai' },
        });
        console.log('Started AI typing indicator');
      }

      // Process the stream
      for await (const event of this.messageStream) {
        await this.handleEvent(event);
      }

      // Get final message
      const finalMessage = await this.messageStream.finalMessage();

      // Check if we need to handle tool use
      if (finalMessage.stop_reason === 'tool_use') {
        await this.handleToolUse(finalMessage);
      } else {
        // Send the final response
        await this.sendFinalResponse();
      }

      if (isKaiChannel) {
        // Clear AI state when done
        await this.channel.sendEvent({
          type: 'ai_indicator.clear',
          user: { id: 'kai' },
        });
        console.log('Cleared AI state');
      }
    } catch (error) {
      console.error('ClaudeResponseHandler: Error in run():', error);

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
    console.log('Stop generating requested');
    // Claude streaming can be cancelled by aborting the stream
    // The stream will naturally end
  };

  private handleEvent = async (event: Anthropic.MessageStreamEvent) => {
    try {
      switch (event.type) {
        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            this.messageText += event.delta.text;
            console.log(`Claude Response: "${this.messageText}"`);
          }
          break;

        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            // Track tool use blocks
            this.toolUseBlocks.push(event.content_block as Anthropic.ToolUseBlock);
          }
          break;

        case 'message_stop':
          console.log('Message stream completed');
          break;
      }
    } catch (error) {
      console.error('Error handling event:', error);
    }
  };

  private handleToolUse = async (message: Anthropic.Message) => {
    const toolUseBlocks = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      await this.sendFinalResponse();
      return;
    }

    // Process each tool call
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      console.log('Processing tool call:', toolUse.name);

      let result: string;

      switch (toolUse.name) {
        case 'fetch_group_conversation':
          const groupArgs = toolUse.input as FetchGroupConversationArguments;
          const groupMessages = await this.getGroupConversationsByDate(groupArgs);
          result = groupMessages.join(', ');
          break;

        case 'fetch_user_conversations':
          const userArgs = toolUse.input as FetchUserConversationsArguments;
          const userMessages = await this.getUserConversationsByLimit(userArgs);
          result = userMessages?.join(', ') || '';
          break;

        case 'create_task':
          const taskArgs = toolUse.input as CreateTaskArguments;
          const taskResult = await this.createTask(taskArgs);
          result = JSON.stringify(taskResult);
          break;

        case 'create_event':
          const eventArgs = toolUse.input as CreateEventArguments;
          const eventResult = await this.createEvent(eventArgs);
          result = JSON.stringify(eventResult);
          break;

        default:
          console.log('Unknown tool call:', toolUse.name);
          result = 'Unknown function';
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Continue the conversation with tool results
    await this.continueWithToolResults(message, toolResults);
  };

  private continueWithToolResults = async (
    previousMessage: Anthropic.Message,
    toolResults: Anthropic.ToolResultBlockParam[]
  ) => {
    // Build messages array with tool results
    const messages: Anthropic.MessageParam[] = [];

    // Add conversation history
    if (this.conversationHistory) {
      for (const msg of this.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content as any,
        });
      }
    }

    // Add assistant message with tool use
    messages.push({
      role: 'assistant',
      content: previousMessage.content,
    });

    // Add tool results
    messages.push({
      role: 'user',
      content: toolResults,
    });

    try {
      // Make another API call with tool results
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: this.systemPrompt || '',
        messages,
        tools: this.tools && this.tools.length > 0 ? this.tools : undefined,
      });

      // Extract text from response
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      this.messageText = textBlocks.map((block) => block.text).join('\n');

      // Check if more tool calls are needed
      if (response.stop_reason === 'tool_use') {
        await this.handleToolUse(response);
      } else {
        await this.sendFinalResponse();
      }
    } catch (error) {
      console.error('Error continuing with tool results:', error);
      await this.sendFinalResponse();
    }
  };

  private sendFinalResponse = async () => {
    const text = this.messageText?.trim() || '';
    console.log(`Final AI Response: "${text}"`);

    if (!text || text.length === 0) {
      console.warn('Skipping empty message');
      return;
    }

    const isKaiChannel = this.channel.id?.indexOf('kai') === 0;

    // Add assistant response to conversation history
    if (this.conversationHistory) {
      this.conversationHistory.push({
        role: 'assistant',
        content: text,
      });
    }

    if (isKaiChannel) {
      // Send message to Kai channel
      await this.channel.sendMessage({
        text,
        user: { id: 'kai' },
        ai_generated: true,
      });
      console.log('Sent Kai response');
    } else if (this.messageId) {
      // Update original message with task/event detection
      const { isTask, isEvent, taskData, eventData } = this.parseTaskData(text);
      console.log(`Classification - IsTask: ${isTask} | IsEvent: ${isEvent}`);

      const originalMessage = await this.chatClient.getMessage(this.messageId);

      const extraData: any = {
        istask: isTask ? 1 : 0,
        isevent: isEvent ? 1 : 0,
        processing: false,
      };

      if (isTask && taskData) {
        extraData.taskData = taskData;
        console.log(`Saving task data: ${JSON.stringify(taskData)}`);
      }

      if (isEvent && eventData) {
        extraData.eventData = eventData;
        console.log(`Saving event data: ${JSON.stringify(eventData)}`);
      }

      await this.chatClient.updateMessage({
        id: originalMessage.message.id,
        text: originalMessage.message.text,
        attachments: originalMessage.message.attachments,
        mentioned_users: originalMessage.message.mentioned_users?.map((u) => u.id),
        user_id: originalMessage.message.user?.id,
        extraData: extraData,
      });
      console.log(`Updated message - istask: ${isTask ? 1 : 0}, isevent: ${isEvent ? 1 : 0}`);
    } else {
      // Send new message
      const messageResponse = await this.channel.sendMessage({
        text,
        user_id: this.user.id,
        type: 'system',
        restricted_visibility: [this.user.id],
      });

      if (messageResponse?.message?.id) {
        const { isTask, isEvent, taskData, eventData } = this.parseTaskData(text);
        console.log(`Classification - IsTask: ${isTask} | IsEvent: ${isEvent}`);

        const extraData: any = {
          istask: isTask ? 1 : 0,
          isevent: isEvent ? 1 : 0,
          processing: false,
        };

        if (isTask && taskData) {
          extraData.taskData = taskData;
        }

        if (isEvent && eventData) {
          extraData.eventData = eventData;
        }

        await this.chatClient.updateMessage({
          id: messageResponse.message.id,
          text: messageResponse.message.text,
          attachments: messageResponse.message.attachments,
          mentioned_users: messageResponse.message.mentioned_users?.map((u) => u.id),
          user_id: messageResponse.message.user?.id,
          extraData: extraData,
        });
      }
    }

    this.messageText = '';
  };

  // Tool implementations (same as OpenAI handler)

  private getGroupConversationsByDate = async (args: FetchGroupConversationArguments) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 2);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);

    const channel = this.chatClient.channel('messaging', args.groupId);
    const page1 = await channel.query({
      messages: { limit: 100, created_at_after_or_equal: sevenDaysAgo.toISOString() },
    });

    return page1.messages
      .filter((message) => message.type !== 'system')
      .map((message) => {
        return `${message.user?.name}: ${message.text}`;
      });
  };

  private getUserConversationsByLimit = async (args: FetchUserConversationsArguments) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const channels = await this.chatClient.queryChannels({
      members: { $in: [args.username] },
    });

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

    return allMessages
      .filter((message) => message.type !== 'system' && message.user?.name)
      .map((message) => {
        return `${message.user?.name}: ${message.text}`;
      });
  };

  private getAssigneeIds = (assigneeNames?: string[]): string[] => {
    if (!assigneeNames || assigneeNames.length === 0) {
      return [this.user.id];
    }

    if (this.mentionedUsers && this.mentionedUsers.length > 0) {
      const assigneeIds: string[] = [];

      for (const name of assigneeNames) {
        const matchedUser = this.mentionedUsers.find(
          (u) =>
            u.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(u.name.toLowerCase()) ||
            u.id.toLowerCase().includes(name.toLowerCase())
        );

        if (matchedUser) {
          assigneeIds.push(matchedUser.id);
          console.log(`Matched "${name}" to "${matchedUser.id}" (${matchedUser.name})`);
        } else {
          console.log(`No match for "${name}" in mentioned users`);
        }
      }

      return assigneeIds.length > 0 ? assigneeIds : [this.user.id];
    }

    return [this.user.id];
  };

  private getAssigneeNames = (assigneeIds: string[]): string[] => {
    if (!this.mentionedUsers || this.mentionedUsers.length === 0) {
      return assigneeIds;
    }

    return assigneeIds.map((id) => {
      const user = this.mentionedUsers?.find((u) => u.id === id);
      return user?.name || id;
    });
  };

  private createTask = async (
    args: CreateTaskArguments
  ): Promise<{ success: boolean; task?: any; error?: string }> => {
    try {
      console.log('Creating task via Claude:', args.title);

      const assigneeIds = this.getAssigneeIds(args.assignees);
      const assigneeNames = this.getAssigneeNames(assigneeIds);

      const task = new Task({
        name: args.title,
        description: args.description || '',
        priority: args.priority || 'medium',
        completionDate: args.dueDate
          ? new Date(args.dueDate)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        assignee: assigneeIds,
        createdBy: this.user.id,
        channelId: this.channel.id,
        status: 'todo',
        completed: false,
      });

      await task.save();
      console.log('Task created:', task._id, 'Assignees:', assigneeIds);

      return {
        success: true,
        task: {
          id: task._id,
          title: task.name,
          priority: task.priority,
          dueDate: task.completionDate,
          assignees: assigneeNames,
        },
      };
    } catch (error) {
      console.error('Error creating task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      };
    }
  };

  private createEvent = async (
    args: CreateEventArguments
  ): Promise<{ success: boolean; event?: any; error?: string }> => {
    try {
      console.log('Creating event via Claude:', args.title);

      const attendeeIds = this.getAssigneeIds(args.attendees);
      const attendeeNames = this.getAssigneeNames(attendeeIds);

      const event = new Event({
        title: args.title,
        description: args.description || '',
        startDate: new Date(args.startDate),
        endDate: args.endDate ? new Date(args.endDate) : null,
        location: args.location || '',
        attendees: attendeeIds,
        organizer: this.user.id,
        channelId: this.channel.id,
        status: 'scheduled',
        reminder: args.reminder || 15,
      });

      await event.save();
      console.log('Event created:', event._id, 'Attendees:', attendeeIds);

      return {
        success: true,
        event: {
          id: event._id,
          title: event.title,
          startDate: event.startDate,
          endDate: event.endDate,
          location: event.location,
          attendees: attendeeNames,
        },
      };
    } catch (error) {
      console.error('Error creating event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create event',
      };
    }
  };

  private removeNullValues = (obj: any): any => {
    const result: any = {};
    for (const key in obj) {
      if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
        if (Array.isArray(obj[key])) {
          if (obj[key].length > 0) {
            result[key] = obj[key];
          }
        } else {
          result[key] = obj[key];
        }
      }
    }
    return result;
  };

  private parseTaskData = (
    text: string
  ): { isTask: boolean; isEvent: boolean; taskData?: any; eventData?: any } => {
    const trimmedText = text.trim();

    if (trimmedText === '0') {
      return { isTask: false, isEvent: false };
    }

    try {
      // Strip markdown code blocks if present (e.g., ```json ... ```)
      let jsonText = trimmedText;
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      const data = JSON.parse(jsonText);

      if (data && data.type) {
        switch (data.type) {
          case 'task':
            console.log('Detected TASK:', data.title);
            const priority = (data.priority || 'medium').toLowerCase();
            const taskData = this.removeNullValues({
              title: data.title,
              description: data.description,
              priority: priority,
              dueDate: data.dueDate,
              assignees: data.assignees,
              subtasks: data.subtasks,
            });
            return { isTask: true, isEvent: false, taskData };

          case 'event':
            console.log('Detected EVENT:', data.title);
            const eventData = this.removeNullValues({
              title: data.title,
              description: data.description,
              startDate: data.startDate,
              endDate: data.endDate,
              location: data.location,
              attendees: data.attendees,
              reminder: data.reminder || 15,
            });
            return { isTask: false, isEvent: true, eventData };

          case 'none':
            return { isTask: false, isEvent: false };
        }
      }

      // Legacy format
      if (data && (data.title || data.description || data.priority || data.subtasks)) {
        if (data.priority) {
          data.priority = data.priority.toLowerCase();
        }
        const legacyTaskData = this.removeNullValues(data);
        return { isTask: true, isEvent: false, taskData: legacyTaskData };
      }
    } catch (error) {
      // Not valid JSON, fall back to keyword detection
      console.log('Response is not valid JSON, using keyword detection');
    }

    return { isTask: this.determineIfTask(text), isEvent: false };
  };

  private determineIfTask = (text: string): boolean => {
    const isKaiUser = this.user.id === 'kai' || this.channel.id?.indexOf('kai') === 0;

    if (isKaiUser) {
      const taskKeywords = [
        'task',
        'todo',
        'deadline',
        'due',
        'complete',
        'finish',
        'assign',
        'schedule',
        'meeting',
        'appointment',
        'reminder',
        'urgent',
        'priority',
        'project',
        'work',
        'action item',
        'follow up',
        'checklist',
      ];

      const lowerText = text.toLowerCase();
      return taskKeywords.some((keyword) => lowerText.includes(keyword));
    } else {
      const trimmedText = text.trim();
      return trimmedText === '1';
    }
  };
}
