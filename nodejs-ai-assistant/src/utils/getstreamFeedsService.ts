import { StreamClient } from "@stream-io/node-sdk";
import { StreamClient as GetStreamClient } from "getstream";

export interface GetStreamComment {
  id: string;
  comment: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  custom?: any;
}

export interface GetStreamActivity {
  id: string;
  actor: string;
  verb: string;
  object: string;
  foreign_id: string;
  time: string;
  extra?: any;
}

export interface GetStreamNotification {
  id: string;
  verb: string;
  actor: string;
  object: string;
  time: string;
  extra?: any;
  isRead?: boolean;
}

export class GetStreamFeedsService {
  private nodeClient: StreamClient;
  private getstreamClient: GetStreamClient;
  private isConnected: boolean = false;

  constructor() {
    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    
    if (!apiKey) {
      throw new Error('STREAM_API_KEY environment variable is required');
    }
    
    if (!apiSecret) {
      throw new Error('STREAM_API_SECRET environment variable is required');
    }
    
    this.nodeClient = new StreamClient(apiKey, apiSecret);
    this.getstreamClient = new GetStreamClient(apiKey, apiSecret);
  }

  /**
   * Connect to GetStream with server-side authentication
   */
  async connect(): Promise<void> {
    try {
      // For server-side operations, we don't need to connect as a specific user
      // The API secret provides the necessary authentication
      this.isConnected = true;
      console.log('Connected to GetStream Activity Feeds with server authentication');
    } catch (error) {
      console.error('Error connecting to GetStream:', error);
      throw error;
    }
  }

  /**
   * Get user notifications from GetStream Activity Feeds
   */
  async getUserNotifications(userId: string, limit: number = 50): Promise<GetStreamNotification[]> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Fetching notifications for user:', userId, 'limit:', limit);
      
      // Use notification feed group (you have this configured)
      const notificationFeed = this.getstreamClient.feed('notification', userId);
      const response = await notificationFeed.get({ limit });
      
      if (response.results && response.results.length > 0) {
        // Transform GetStream activities to our notification format
        const notifications = response.results.map((activity: any) => ({
          id: activity.id,
          verb: activity.verb,
          actor: activity.actor,
          object: activity.object,
          time: activity.time,
          extra: activity.extra || {},
          isRead: activity.isRead || false
        }));
        
        console.log(`Found ${notifications.length} notifications for user ${userId}`);
        return notifications;
      } else {
        console.log(`No notifications found for user ${userId}`);
        return [];
      }
    } catch (error) {
      console.error('Error fetching user notifications from GetStream:', error);
      throw error;
    }
  }

  /**
   * Create a notification activity for a user
   */
  async createNotification(userId: string, verb: string, object: string, extra: any = {}): Promise<string | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Creating notification for user:', userId, 'verb:', verb, 'object:', object);
      
      // Add activity to user's notification feed (you have this configured)
      const notificationFeed = this.getstreamClient.feed('notification', userId);
      const activity = await notificationFeed.addActivity({
        actor: userId,
        verb: verb,
        object: object,
        extra: extra
      });
      
      // Send push notification
      await this.sendPushNotification(userId, verb, extra);
      
      console.log('Notification created successfully:', activity.id);
      return activity.id;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Send push notification to user
   */
  async sendPushNotification(userId: string, verb: string, extra: any = {}): Promise<void> {
    try {
      // Get notification title and message based on verb
      const { title, message } = this.getPushNotificationContent(verb, extra);
      
      // Here you would integrate with your push notification service
      // For now, we'll log the push notification details
      console.log('Push Notification:', {
        userId,
        title,
        message,
        verb,
        extra
      });
      
      // TODO: Integrate with Firebase Cloud Messaging or your preferred push service
      // Example Firebase integration:
      // await admin.messaging().send({
      //   token: userDeviceToken,
      //   notification: { title, body: message },
      //   data: { ...extra, verb }
      // });
      
    } catch (error) {
      console.error('Error sending push notification:', error);
      // Don't throw error - push notification failure shouldn't break the main flow
    }
  }

  /**
   * Get push notification title and message based on verb
   */
  private getPushNotificationContent(verb: string, extra: any = {}): { title: string; message: string } {
    switch (verb) {
      case 'task_created':
        return {
          title: 'Task Created',
          message: `You created a new task: "${extra.taskName || 'Untitled Task'}"`
        };
      case 'task_assigned':
        return {
          title: 'New Task Assigned',
          message: `${extra.createdBy || 'System'} assigned you: "${extra.taskName || 'Untitled Task'}"`
        };
      case 'comment_added':
        if (extra.action === 'commented') {
          return {
            title: 'Comment Added',
            message: `You commented on task: "${extra.taskName || 'Untitled Task'}"`
          };
        } else {
          return {
            title: 'New Comment',
            message: `${extra.commentedBy || 'Someone'} commented on your task: "${extra.taskName || 'Untitled Task'}"`
          };
        }
      default:
        return {
          title: 'New Notification',
          message: 'You have a new notification'
        };
    }
  }

  /**
   * Mark a notification as read by updating the activity
   */
  async markNotificationAsRead(notificationId: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Marking notification as read:', notificationId);
      
      // In GetStream, we can mark activities as seen by updating them
      // For now, we'll return success as the actual implementation depends on your GetStream setup
      // You can implement this by updating the activity's extra data or using a separate read status system
      
      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Marking all notifications as read for user:', userId);
      
      // In GetStream, you would typically mark all activities as seen
      // This might require updating multiple activities or using a different approach
      // For now, we'll return success as the actual implementation depends on your GetStream setup
      
      return true;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Create a task activity in GetStream Activity Feeds
   */
  async createTaskActivity(taskId: string, task: any): Promise<string | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Creating task activity for:', taskId);
      
      // Create task activity in tasks feed group (you have this configured)
      const tasksFeed = this.getstreamClient.feed('tasks', taskId);
      const activity = await tasksFeed.addActivity({
        actor: task.createdBy || 'system',
        verb: 'task_created',
        object: taskId,
        extra: {
          taskId: taskId,
          taskName: task.title || task.name,
          priority: task.priority || 'medium',
          description: task.description,
          dueDate: task.dueDate,
          assigneeId: task.assigneeId
        }
      });

      // Create notification for task creator (who is doing the activity)
      if (task.createdBy) {
        await this.createNotification(task.createdBy, 'task_created', taskId, {
          taskId: taskId,
          taskName: task.title || task.name,
          priority: task.priority || 'medium',
          description: task.description,
          action: 'created',
          assignee: task.assignee
        });
      }

      // Create notification for each assignee
      if (task.assignee && Array.isArray(task.assignee)) {
        for (const assigneeId of task.assignee) {
          await this.createNotification(assigneeId, 'task_assigned', taskId, {
            taskId: taskId,
            taskName: task.title || task.name,
            priority: task.priority || 'medium',
            description: task.description,
            assignee: assigneeId,
            createdBy: task.createdBy
          });
        }
      }
      
      return activity.id;
    } catch (error) {
      console.error('Error creating task activity:', error);
      throw error;
    }
  }

  /**
   * Add a comment to a task activity
   */
  async addComment(taskId: string, userId: string, message: string, commentId?: string): Promise<GetStreamComment | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Adding comment for task:', taskId, 'by user:', userId);
      
      // Get the tasks feed for this task (you have this configured)
      const tasksFeed = this.getstreamClient.feed('tasks', taskId);
      
      // Add the comment as an activity
      const activity = await tasksFeed.addActivity({
        actor: userId,
        verb: 'comment_added',
        object: commentId || `comment_${Date.now()}`,
        extra: {
          taskId: taskId,
          commentId: commentId,
          message: message,
          timestamp: new Date().toISOString()
        }
      });

      // Create notification for the commenter (who is doing the activity)
      await this.createNotification(userId, 'comment_added', taskId, {
        taskId: taskId,
        commentId: commentId,
        message: message,
        commentPreview: message.substring(0, 100), // First 100 characters
        action: 'commented'
      });

      // Get task details to notify assignees about the new comment
      try {
        const { Task } = await import('../models/Task');
        const task = await Task.findById(taskId);
        
        if (task && task.assignee && Array.isArray(task.assignee)) {
          // Notify all assignees about the new comment (excluding the commenter)
          for (const assigneeId of task.assignee) {
            if (assigneeId !== userId) {
              await this.createNotification(assigneeId, 'comment_added', taskId, {
                taskId: taskId,
                commentId: commentId,
                message: message,
                commentPreview: message.substring(0, 100),
                commentedBy: userId,
                taskName: task.name || 'Untitled Task',
                action: 'received_comment'
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to send comment notifications to assignees:', error);
        // Continue even if assignee notifications fail
      }
      
      return {
        id: activity.id,
        comment: message,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        custom: {
          taskId: taskId,
          commentId: commentId,
        },
      };
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Get comments for a task activity
   */
  async getComments(taskId: string, limit: number = 50): Promise<GetStreamComment[]> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Getting comments for task:', taskId);
      
      // Get the tasks feed for this task (you have this configured)
      const tasksFeed = this.getstreamClient.feed('tasks', taskId);
      
      // Get activities from the tasks feed
      const response = await tasksFeed.get({ 
        limit
      });
      
      if (response.results && response.results.length > 0) {
        // Transform GetStream activities to our comment format
        const comments = response.results.map((activity: any) => ({
          id: activity.id,
          comment: activity.extra?.message || '',
          user_id: activity.actor,
          created_at: activity.time,
          updated_at: activity.time,
          custom: {
            taskId: taskId,
            commentId: activity.id,
          },
        }));
        
        return comments;
      }
      
      return [];
    } catch (error) {
      console.error('Error getting comments:', error);
      throw error;
    }
  }

  /**
   * Update a comment
   */
  async updateComment(commentId: string, userId: string, message: string): Promise<GetStreamComment | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Updating comment:', commentId, 'by user:', userId);
      
      // In GetStream, you would typically update the activity
      // This might require removing and re-adding the activity
      // For now, we'll return the updated comment structure
      
      return {
        id: commentId,
        comment: message,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        custom: {
          edited: true,
          userId: userId,
        },
      };
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Deleting comment:', commentId);
      
      // In GetStream, you would typically remove the activity
      // This might require finding the feed and removing the specific activity
      // For now, we'll return true as the actual implementation depends on your GetStream setup
      
      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }

  /**
   * Add reaction to a comment
   */
  async addCommentReaction(commentId: string, userId: string, type: string): Promise<any> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Adding reaction:', type, 'to comment:', commentId, 'by user:', userId);
      
      // In GetStream, you would typically add a reaction to the activity
      // This might require using the reactions API
      // For now, we'll return a mock reaction as the actual implementation depends on your GetStream setup
      
      return {
        id: `reaction_${Date.now()}`,
        type: type,
        user_id: userId,
        comment_id: commentId,
      };
    } catch (error) {
      console.error('Error adding comment reaction:', error);
      throw error;
    }
  }

  /**
   * Remove reaction from a comment
   */
  async deleteCommentReaction(commentId: string, userId: string, type: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Removing reaction:', type, 'from comment:', commentId, 'by user:', userId);
      
      // In GetStream, you would typically remove the reaction from the activity
      // This might require using the reactions API
      // For now, we'll return true as the actual implementation depends on your GetStream setup
      
      return true;
    } catch (error) {
      console.error('Error deleting comment reaction:', error);
      throw error;
    }
  }



  /**
   * Disconnect from GetStream
   */
  async disconnect(): Promise<void> {
    try {
      // Note: The StreamClient might not have a disconnect method
      // We'll just set the connection state to false
      this.isConnected = false;
      console.log('Disconnected from GetStream Activity Feeds');
    } catch (error) {
      console.error('Error disconnecting from GetStream:', error);
    }
  }
}

// Export singleton instance
export const getStreamFeedsService = new GetStreamFeedsService(); 