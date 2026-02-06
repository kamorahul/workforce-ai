/**
 * Get Tasks Skill Tests
 */

import { getTasksHandler, GetTasksArgs } from '../skills/getTasksSkill';
import { SkillContext } from '../types';
import { Task } from '../../../models/Task';

// Mock dependencies
jest.mock('../../../models/Task');

describe('getTasksSkill', () => {
  const mockContext: SkillContext = {
    userId: 'user123',
    channelId: 'channel456',
    timezone: 'America/New_York',
  };

  const mockTasks = [
    {
      _id: 'task_1',
      name: 'Task 1',
      description: 'Description 1',
      priority: 'high',
      completionDate: new Date('2026-02-10'),
      assignee: ['user123'],
      status: 'todo',
      timezone: 'America/New_York',
    },
    {
      _id: 'task_2',
      name: 'Task 2',
      description: 'Description 2',
      priority: 'medium',
      completionDate: new Date('2026-02-15'),
      assignee: ['user123', 'user456'],
      status: 'in_progress',
      timezone: 'UTC',
    },
    {
      _id: 'task_3',
      name: 'Task 3',
      priority: 'low',
      assignee: ['user123'],
      status: 'completed',
      completed: true,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Task.find chain
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockTasks),
    };
    (Task.find as jest.Mock).mockReturnValue(mockQuery);
  });

  describe('getTasksHandler', () => {
    it('should fetch all tasks for user by default', async () => {
      const args: GetTasksArgs = {};

      const result = await getTasksHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(Task.find).toHaveBeenCalledWith({
        $or: [
          { assignee: { $in: ['user123'] } },
          { createdBy: 'user123' },
        ],
      });
    });

    it('should filter by status when specified', async () => {
      const args: GetTasksArgs = { status: 'todo' };

      await getTasksHandler(args, mockContext);

      expect(Task.find).toHaveBeenCalledWith({
        $or: expect.any(Array),
        status: 'todo',
      });
    });

    it('should return all statuses when status is "all"', async () => {
      const args: GetTasksArgs = { status: 'all' };

      await getTasksHandler(args, mockContext);

      const findCall = (Task.find as jest.Mock).mock.calls[0][0];
      expect(findCall.status).toBeUndefined();
    });

    it('should filter by assignedToMe only', async () => {
      const args: GetTasksArgs = {
        assignedToMe: true,
        createdByMe: false,
      };

      await getTasksHandler(args, mockContext);

      expect(Task.find).toHaveBeenCalledWith({
        assignee: { $in: ['user123'] },
      });
    });

    it('should filter by createdByMe only', async () => {
      const args: GetTasksArgs = {
        assignedToMe: false,
        createdByMe: true,
      };

      await getTasksHandler(args, mockContext);

      expect(Task.find).toHaveBeenCalledWith({
        createdBy: 'user123',
      });
    });

    it('should respect limit parameter', async () => {
      const args: GetTasksArgs = { limit: 10 };

      await getTasksHandler(args, mockContext);

      const mockQuery = (Task.find as jest.Mock).mock.results[0].value;
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should use default limit of 50', async () => {
      const args: GetTasksArgs = {};

      await getTasksHandler(args, mockContext);

      const mockQuery = (Task.find as jest.Mock).mock.results[0].value;
      expect(mockQuery.limit).toHaveBeenCalledWith(50);
    });

    it('should sort by createdAt descending', async () => {
      const args: GetTasksArgs = {};

      await getTasksHandler(args, mockContext);

      const mockQuery = (Task.find as jest.Mock).mock.results[0].value;
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should transform tasks to TaskData format', async () => {
      const args: GetTasksArgs = {};

      const result = await getTasksHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.[0]).toEqual({
        id: 'task_1',
        title: 'Task 1',
        description: 'Description 1',
        priority: 'high',
        dueDate: expect.any(Date),
        assignees: ['user123'],
        status: 'todo',
        timezone: 'America/New_York',
      });
    });

    it('should handle tasks with completed flag but no status', async () => {
      const tasksWithLegacyStatus = [
        {
          _id: 'task_legacy',
          name: 'Legacy Task',
          priority: 'medium',
          assignee: ['user123'],
          completed: true,
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(tasksWithLegacyStatus),
      };
      (Task.find as jest.Mock).mockReturnValue(mockQuery);

      const result = await getTasksHandler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.[0].status).toBe('completed');
    });

    it('should handle database errors gracefully', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      (Task.find as jest.Mock).mockReturnValue(mockQuery);

      const result = await getTasksHandler({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should return empty array when no tasks found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
      (Task.find as jest.Mock).mockReturnValue(mockQuery);

      const result = await getTasksHandler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle missing priority field', async () => {
      const tasksWithoutPriority = [
        {
          _id: 'task_no_priority',
          name: 'Task without priority',
          assignee: ['user123'],
          status: 'todo',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(tasksWithoutPriority),
      };
      (Task.find as jest.Mock).mockReturnValue(mockQuery);

      const result = await getTasksHandler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.[0].priority).toBe('medium'); // default
    });
  });
});
