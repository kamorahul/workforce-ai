/**
 * Get Tasks Skill
 * Query tasks for the current user
 */

import { Task } from '../../../models/Task';
import { SkillDefinition, SkillContext, SkillResult, TaskData } from '../types';

export interface GetTasksArgs {
  status?: 'todo' | 'in_progress' | 'completed' | 'all';
  limit?: number;
  assignedToMe?: boolean;
  createdByMe?: boolean;
}

/**
 * Get tasks handler - queries tasks from the database
 */
export async function getTasksHandler(
  args: GetTasksArgs,
  context: SkillContext
): Promise<SkillResult<TaskData[]>> {
  try {
    console.log('[getTasksSkill] Fetching tasks for user:', context.userId);
    console.log('[getTasksSkill] Args:', args);

    // Build query based on args
    const query: any = {};

    // Filter by user (assigned to me or created by me)
    if (args.assignedToMe !== false && args.createdByMe !== false) {
      // Default: both assigned and created
      query.$or = [
        { assignee: { $in: [context.userId] } },
        { createdBy: context.userId },
      ];
    } else if (args.assignedToMe) {
      query.assignee = { $in: [context.userId] };
    } else if (args.createdByMe) {
      query.createdBy = context.userId;
    }

    // Filter by status
    if (args.status && args.status !== 'all') {
      query.status = args.status;
    }

    const limit = args.limit || 50;

    const tasks = await Task.find(query)
      .select('name description status completed createdAt completionDate assignee priority timezone')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    console.log(`[getTasksSkill] Found ${tasks.length} tasks`);

    const taskData: TaskData[] = tasks.map((task: any) => ({
      id: task._id.toString(),
      title: task.name,
      description: task.description,
      priority: task.priority || 'medium',
      dueDate: task.completionDate,
      assignees: task.assignee || [],
      status: task.status || (task.completed ? 'completed' : 'todo'),
      timezone: task.timezone,
    }));

    return {
      success: true,
      data: taskData,
    };
  } catch (error) {
    console.error('[getTasksSkill] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch tasks',
    };
  }
}

/**
 * Get Tasks Skill Definition
 */
export const getTasksSkill: SkillDefinition = {
  name: 'get_tasks',
  description: 'Get tasks for the current user. Can filter by status and ownership.',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'completed', 'all'],
        description: 'Filter tasks by status. Use "all" for all statuses.',
        default: 'all',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return',
        default: 50,
      },
      assignedToMe: {
        type: 'boolean',
        description: 'Include tasks assigned to the user',
        default: true,
      },
      createdByMe: {
        type: 'boolean',
        description: 'Include tasks created by the user',
        default: true,
      },
    },
    required: [],
  },
  handler: getTasksHandler,
};
