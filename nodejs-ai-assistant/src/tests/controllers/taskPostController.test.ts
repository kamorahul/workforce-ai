import request from 'supertest';
import { app } from '../../index';
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

describe('Task Post Controller - Notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /task - Task Creation Notifications', () => {
    it('should send notifications when creating a new task', async () => {
      const taskData = {
        name: 'Test Task',
        assignee: ['user1', 'user2'],
        priority: 'high',
        completionDate: '2024-12-31',
        channelId: 'test-channel-123',
        description: 'Test task description',
        createdBy: 'creator1'
      };

      const response = await request(app)
        .post('/task')
        .send(taskData)
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.task).toBeDefined();

      // Verify that notifications were sent
      const mockChannel = serverClient.channel as jest.Mock;
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'test-channel-123');
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'group_user1');
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'group_user2');
    });

    it('should handle notification failures gracefully', async () => {
      // Mock a notification failure
      const mockChannel = serverClient.channel as jest.Mock;
      mockChannel.mockImplementation(() => ({
        sendMessage: jest.fn().mockRejectedValue(new Error('Notification failed'))
      }));

      const taskData = {
        name: 'Test Task',
        assignee: ['user1'],
        priority: 'medium',
        completionDate: '2024-12-31',
        channelId: 'test-channel-123',
        description: 'Test task description',
        createdBy: 'creator1'
      };

      // Task should still be created even if notifications fail
      const response = await request(app)
        .post('/task')
        .send(taskData)
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.task).toBeDefined();
    });
  });

  describe('PUT /task/:taskId - Task Update Notifications', () => {
    it('should send notifications when assignees change', async () => {
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

      const createResponse = await request(app)
        .post('/task')
        .send(taskData)
        .expect(201);

      const taskId = createResponse.body.task._id;

      // Update the task with new assignees
      const updateData = {
        assignee: ['user2', 'user3']
      };

      const updateResponse = await request(app)
        .put(`/task/${taskId}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.status).toBe('success');

      // Verify that notifications were sent for the change
      const mockChannel = serverClient.channel as jest.Mock;
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'test-channel-123');
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'group_user2');
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'group_user3');
    });

    it('should not send notifications when assignees remain the same', async () => {
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

      const createResponse = await request(app)
        .post('/task')
        .send(taskData)
        .expect(201);

      const taskId = createResponse.body.task._id;

      // Update the task with same assignees but different name
      const updateData = {
        name: 'Updated Task Name'
      };

      const updateResponse = await request(app)
        .put(`/task/${taskId}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.status).toBe('success');

      // Verify that no additional notifications were sent
      const mockChannel = serverClient.channel as jest.Mock;
      // Should only have the initial creation notifications
      expect(mockChannel).toHaveBeenCalledTimes(3); // channel + user1 + user1 (creation)
    });
  });

  describe('PATCH /task/:taskId/complete - Task Completion Notifications', () => {
    it('should send completion notifications when task is completed', async () => {
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

      const createResponse = await request(app)
        .post('/task')
        .send(taskData)
        .expect(201);

      const taskId = createResponse.body.task._id;

      // Complete the task
      const completeResponse = await request(app)
        .patch(`/task/${taskId}/complete`)
        .query({ completed: 'true' })
        .expect(200);

      expect(completeResponse.body.status).toBe('success');

      // Verify that completion notifications were sent
      const mockChannel = serverClient.channel as jest.Mock;
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'test-channel-123');
      expect(mockChannel).toHaveBeenCalledWith('messaging', 'group_user1');
    });
  });
});
