/**
 * Create Task Skill
 * Wraps existing Task model functionality for OpenClaw integration
 */

import { Task } from '../../../models/Task';
import { getStreamFeedsService } from '../../../utils/getstreamFeedsService';
import { SkillDefinition, SkillContext, SkillResult, TaskData } from '../types';

export interface CreateTaskArgs {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  assignees?: string[];
}

/**
 * Get assignee IDs from mentioned users by matching names
 */
function getAssigneeIds(
  assigneeNames: string[] | undefined,
  context: SkillContext
): string[] {
  if (!assigneeNames || assigneeNames.length === 0) {
    return [context.userId];
  }

  if (context.mentionedUsers && context.mentionedUsers.length > 0) {
    const assigneeIds: string[] = [];

    for (const name of assigneeNames) {
      const matchedUser = context.mentionedUsers.find(
        (u) =>
          u.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(u.name.toLowerCase()) ||
          u.id.toLowerCase().includes(name.toLowerCase())
      );

      if (matchedUser) {
        assigneeIds.push(matchedUser.id);
        console.log(`[createTaskSkill] Matched "${name}" to "${matchedUser.id}"`);
      }
    }

    return assigneeIds.length > 0 ? assigneeIds : [context.userId];
  }

  return [context.userId];
}

/**
 * Get assignee names for response
 */
function getAssigneeNames(
  assigneeIds: string[],
  context: SkillContext
): string[] {
  if (!context.mentionedUsers || context.mentionedUsers.length === 0) {
    return assigneeIds;
  }

  return assigneeIds.map((id) => {
    const user = context.mentionedUsers?.find((u) => u.id === id);
    return user?.name || id;
  });
}

/**
 * Create task handler - creates a task in the database
 */
export async function createTaskHandler(
  args: CreateTaskArgs,
  context: SkillContext
): Promise<SkillResult<TaskData>> {
  try {
    console.log('[createTaskSkill] Creating task:', args.title);
    console.log('[createTaskSkill] Context:', {
      userId: context.userId,
      channelId: context.channelId,
      timezone: context.timezone,
    });

    const assigneeIds = getAssigneeIds(args.assignees, context);
    const assigneeNames = getAssigneeNames(assigneeIds, context);
    const timezone = context.timezone || 'UTC';

    const task = new Task({
      name: args.title,
      description: args.description || '',
      priority: args.priority || 'medium',
      completionDate: args.dueDate
        ? new Date(args.dueDate)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
      assignee: assigneeIds,
      createdBy: context.userId,
      channelId: context.channelId,
      status: 'todo',
      completed: false,
      timezone: timezone,
    });

    await task.save();
    const taskId = (task._id as any).toString();
    console.log('[createTaskSkill] Task created:', taskId);

    // Send notifications to assignees
    try {
      await getStreamFeedsService.createTaskActivity(taskId, task);
      console.log('[createTaskSkill] Notifications sent');
    } catch (notifError) {
      console.error('[createTaskSkill] Failed to send notifications:', notifError);
      // Don't fail task creation if notifications fail
    }

    return {
      success: true,
      data: {
        id: taskId,
        title: task.name,
        description: task.description,
        priority: task.priority,
        dueDate: task.completionDate,
        assignees: assigneeNames,
        status: task.status,
        timezone: timezone,
      },
    };
  } catch (error) {
    console.error('[createTaskSkill] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create task',
    };
  }
}

/**
 * Create Task Skill Definition
 */
export const createTaskSkill: SkillDefinition = {
  name: 'create_task',
  description: 'Create a new task for the user. Use UTC format for dueDate.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The title of the task',
      },
      description: {
        type: 'string',
        description: 'Optional description of the task',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Priority level of the task',
        default: 'medium',
      },
      dueDate: {
        type: 'string',
        description: 'Due date in UTC ISO format (must end with Z)',
      },
      assignees: {
        type: 'array',
        items: { type: 'string', description: 'Username to assign' },
        description: 'Usernames to assign the task to',
      },
    },
    required: ['title'],
  },
  handler: createTaskHandler,
};
