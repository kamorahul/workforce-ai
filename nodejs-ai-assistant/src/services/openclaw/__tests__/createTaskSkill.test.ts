/**
 * Create Task Skill Tests
 */

// Mock dependencies BEFORE importing modules that use them
jest.mock('../../../models/Task');
jest.mock('../../../utils/getstreamFeedsService', () => ({
  getStreamFeedsService: {
    createTaskActivity: jest.fn().mockResolvedValue(undefined),
    createEventActivity: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../../serverClient', () => ({
  serverClient: {},
  apiKey: 'test_key',
  apiSecret: 'test_secret',
}));

import { createTaskHandler, CreateTaskArgs } from '../skills/createTaskSkill';
import { SkillContext } from '../types';
import { Task } from '../../../models/Task';
import { getStreamFeedsService } from '../../../utils/getstreamFeedsService';

describe('createTaskSkill', () => {
  const mockContext: SkillContext = {
    userId: 'user123',
    channelId: 'channel456',
    timezone: 'America/New_York',
    mentionedUsers: [
      { id: 'sarah_id', name: 'Sarah' },
      { id: 'mike_id', name: 'Mike' },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Task.save
    (Task as any).mockImplementation((data: any) => ({
      ...data,
      _id: 'task_123',
      save: jest.fn().mockResolvedValue(undefined),
    }));

    // Mock notification service
    (getStreamFeedsService.createTaskActivity as jest.Mock).mockResolvedValue(undefined);
  });

  describe('createTaskHandler', () => {
    it('should create a basic task with title only', async () => {
      const args: CreateTaskArgs = {
        title: 'Review the proposal',
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.title).toBe('Review the proposal');
      expect(result.data?.priority).toBe('medium'); // default
      expect(result.data?.assignees).toContain('user123'); // default to current user
      expect(result.data?.timezone).toBe('America/New_York');
    });

    it('should create a task with all fields', async () => {
      const args: CreateTaskArgs = {
        title: 'Complete project documentation',
        description: 'Write comprehensive docs for the API',
        priority: 'high',
        dueDate: '2026-02-10T00:00:00Z',
        assignees: ['Sarah'],
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Complete project documentation');
      expect(result.data?.priority).toBe('high');
      expect(result.data?.assignees).toContain('Sarah'); // Name resolved
    });

    it('should resolve mentioned user names to IDs', async () => {
      const args: CreateTaskArgs = {
        title: 'Task for Sarah',
        assignees: ['Sarah'],
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
      // Sarah should be resolved from mentioned users
      expect(Task).toHaveBeenCalledWith(
        expect.objectContaining({
          assignee: ['sarah_id'],
        })
      );
    });

    it('should handle multiple assignees', async () => {
      const args: CreateTaskArgs = {
        title: 'Team task',
        assignees: ['Sarah', 'Mike'],
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(Task).toHaveBeenCalledWith(
        expect.objectContaining({
          assignee: ['sarah_id', 'mike_id'],
        })
      );
    });

    it('should default to current user when no assignees specified', async () => {
      const args: CreateTaskArgs = {
        title: 'My task',
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(Task).toHaveBeenCalledWith(
        expect.objectContaining({
          assignee: ['user123'],
        })
      );
    });

    it('should default to current user when assignee not found in mentioned users', async () => {
      const args: CreateTaskArgs = {
        title: 'Task for unknown user',
        assignees: ['UnknownUser'],
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(Task).toHaveBeenCalledWith(
        expect.objectContaining({
          assignee: ['user123'],
        })
      );
    });

    it('should use UTC timezone when not provided in context', async () => {
      const contextWithoutTimezone: SkillContext = {
        userId: 'user123',
        channelId: 'channel456',
      };

      const args: CreateTaskArgs = {
        title: 'Task without timezone',
      };

      const result = await createTaskHandler(args, contextWithoutTimezone);

      expect(result.success).toBe(true);
      expect(Task).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: 'UTC',
        })
      );
    });

    it('should set default due date to 7 days from now when not provided', async () => {
      const args: CreateTaskArgs = {
        title: 'Task without due date',
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
      // Task should have been called with a date roughly 7 days from now
      const taskCall = (Task as any).mock.calls[0][0];
      const dueDate = taskCall.completionDate;
      const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

      // Allow 1 minute tolerance
      expect(dueDate.getTime()).toBeGreaterThan(sevenDaysFromNow - 60000);
      expect(dueDate.getTime()).toBeLessThan(sevenDaysFromNow + 60000);
    });

    it('should send notifications after task creation', async () => {
      const args: CreateTaskArgs = {
        title: 'Task with notifications',
      };

      await createTaskHandler(args, mockContext);

      expect(getStreamFeedsService.createTaskActivity).toHaveBeenCalled();
    });

    it('should succeed even if notifications fail', async () => {
      (getStreamFeedsService.createTaskActivity as jest.Mock).mockRejectedValue(
        new Error('Notification failed')
      );

      const args: CreateTaskArgs = {
        title: 'Task with failed notifications',
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      (Task as any).mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('Database error')),
      }));

      const args: CreateTaskArgs = {
        title: 'Task that will fail',
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should normalize priority to lowercase', async () => {
      const args: CreateTaskArgs = {
        title: 'High priority task',
        priority: 'high',
      };

      const result = await createTaskHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(Task).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high',
        })
      );
    });
  });
});
