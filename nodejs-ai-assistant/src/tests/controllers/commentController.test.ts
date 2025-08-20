import request from 'supertest';
import { app } from '../../index';
import { Comment } from '../../models/Comment';
import { Task } from '../../models/Task';
import { serverClient } from '../../serverClient';

// Mock the serverClient
jest.mock('../../serverClient', () => ({
  serverClient: {
    channel: jest.fn(() => ({
      sendMessage: jest.fn().mockResolvedValue({ message: { id: 'test-message-id' } })
    }))
  }
}));

describe('Comment Controller - Notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /:taskId/comments - Comment Creation Notifications', () => {
    it('should send notifications when creating a new comment', async () => {
      // First create a task
      const taskData = {
        name: 'Test Task',
        assignee: ['user1', 'user2'],
        priority: 'medium',
        completionDate: '2024-12-31',
        channelId: 'test-channel-123',
        description: 'Test task description',
        createdBy: 'creator1'
      };

      const createTaskResponse = await request(app)
        .post('/task')
        .send(taskData)
        .expect(201);

      const taskId = createTaskResponse.body.task._id;

      // Create a comment on the task
      const commentData = {
        userId: 'user1',
        message: 'This is a test comment'
      };

      const commentResponse = await request(app)
        .post(`/comment/${taskId}/comments`)
        .send(commentData)
        .expect(201);

      expect(commentResponse.body.status).toBe('success');
      expect(commentResponse.body.comment).toBeDefined();

      // Verify that notifications were sent
      const mockChannel = serverClient.channel as jest.Mock;
      // Should send to project channel
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'test-channel-123');
      // Should send to other assignees (excluding the commenter)
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'tai_user2');
      // Should NOT send to the commenter themselves
      expect(mockChannel).not.toHaveBeenCalledWith('messaging', 'tai_user1');
    });

    it('should handle notification failures gracefully', async () => {
      // First create a task
      const taskData = {
        name: 'Test Task',
        assignee: ['user1'],
        priority: 'medium',
        completionDate: '2024-12-31',
        channelId: 'test-channel-123',
        description: 'Test task description',
        createdBy: 'creator1'
      };

      const createTaskResponse = await request(app)
        .post('/task')
        .send(taskData)
        .expect(201);

      const taskId = createTaskResponse.body.task._id;

      // Mock a notification failure
      const mockChannel = serverClient.channel as jest.Mock;
      mockChannel.mockImplementation(() => ({
        sendMessage: jest.fn().mockRejectedValue(new Error('Notification failed'))
      }));

      // Comment should still be created even if notifications fail
      const commentData = {
        userId: 'user1',
        message: 'This is a test comment'
      };

      const commentResponse = await request(app)
        .post(`/comment/${taskId}/comments`)
        .send(commentData)
        .expect(201);

      expect(commentResponse.body.status).toBe('success');
      expect(commentResponse.body.comment).toBeDefined();
    });

    it('should not send notifications to commenter', async () => {
      // First create a task
      const taskData = {
        name: 'Test Task',
        assignee: ['user1', 'user2'],
        priority: 'medium',
        completionDate: '2024-12-31',
        channelId: 'test-channel-123',
        description: 'Test task description',
        createdBy: 'creator1'
      };

      const createTaskResponse = await request(app)
        .post('/task')
        .send(taskData)
        .expect(201);

      const taskId = createTaskResponse.body.task._id;

      // Create a comment on the task
      const commentData = {
        userId: 'user1',
        message: 'This is a test comment'
      };

      const commentResponse = await request(app)
        .post(`/comment/${taskId}/comments`)
        .send(commentData)
        .expect(201);

      expect(commentResponse.body.status).toBe('success');

      // Verify that the commenter (user1) was not notified
      const mockChannel = serverClient.channel as jest.Mock;
      const calls = mockChannel.mock.calls;
      const user1NotificationCalls = calls.filter(call => 
        call[1] === 'tai_user1' && call[0] === 'messaging'
      );
      expect(user1NotificationCalls).toHaveLength(0);
    });
  });
});
