import { FeedsClient } from '@stream-io/feeds-client';

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

export class GetStreamFeedsService {
  private client: FeedsClient;
  private isConnected: boolean = false;

  constructor() {
    const apiKey = process.env.STREAM_API_KEY;
    if (!apiKey) {
      throw new Error('STREAM_API_KEY environment variable is required');
    }
    
    this.client = new FeedsClient(apiKey);
  }

  /**
   * Connect to GetStream with user credentials
   */
  async connectUser(userId: string, userToken: string): Promise<void> {
    try {
      await this.client.connectUser({ id: userId }, userToken);
      this.isConnected = true;
      console.log('Connected to GetStream Activity Feeds');
    } catch (error) {
      console.error('Error connecting to GetStream:', error);
      throw error;
    }
  }

  /**
   * Create a task activity in GetStream Activity Feeds
   */
  async createTaskActivity(taskId: string, task: any, userId: string, userToken: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        await this.connectUser(userId, userToken);
      }

      const feed = this.client.feed('task', taskId);
      await feed.getOrCreate({ watch: true });

      const activity = await feed.addActivity({
        text: `Task: ${task.name}`,
        type: 'task',
        extra: {
          taskId: taskId,
          taskName: task.name,
          priority: task.priority,
          assignee: task.assignee,
          completionDate: task.completionDate,
          description: task.description,
          channelId: task.channelId,
          createdBy: task.createdBy,
        },
      });

      return activity.data?.id || null;
    } catch (error) {
      console.error('Error creating task activity:', error);
      return null;
    }
  }

  /**
   * Add a comment to a task activity
   */
  async addComment(taskId: string, userId: string, userToken: string, message: string, commentId?: string): Promise<GetStreamComment | null> {
    try {
      if (!this.isConnected) {
        await this.connectUser(userId, userToken);
      }

      // Use the client's addComment method directly
      const comment = await this.client.addComment({
        comment: message,
        object_id: `task:${taskId}`,
        object_type: 'activity',
        custom: {
          commentId: commentId,
          taskId: taskId,
        },
      });

      return {
        id: comment.data?.id || '',
        comment: comment.data?.comment || message,
        user_id: userId,
        created_at: comment.data?.created_at || new Date().toISOString(),
        updated_at: comment.data?.updated_at || new Date().toISOString(),
        custom: comment.data?.custom,
      };
    } catch (error) {
      console.error('Error adding comment:', error);
      return null;
    }
  }

  /**
   * Get comments for a task activity
   */
  async getComments(taskId: string, userId: string, userToken: string, limit: number = 50): Promise<GetStreamComment[]> {
    try {
      if (!this.isConnected) {
        await this.connectUser(userId, userToken);
      }

      const response = await this.client.getComments({
        object_id: `task:${taskId}`,
        object_type: 'activity',
        limit: limit,
        sort: 'newest',
      });

      return response.data?.results?.map((comment: any) => ({
        id: comment.id || '',
        comment: comment.comment || '',
        user_id: comment.user_id || userId,
        created_at: comment.created_at || new Date().toISOString(),
        updated_at: comment.updated_at || new Date().toISOString(),
        custom: comment.custom,
      })) || [];
    } catch (error) {
      console.error('Error getting comments:', error);
      return [];
    }
  }

  /**
   * Update a comment
   */
  async updateComment(commentId: string, userId: string, userToken: string, message: string): Promise<GetStreamComment | null> {
    try {
      if (!this.isConnected) {
        await this.connectUser(userId, userToken);
      }

      const comment = await this.client.updateComment({
        comment_id: commentId,
        comment: message,
        custom: {
          edited: true,
        },
      });

      return {
        id: comment.data?.id || commentId,
        comment: comment.data?.comment || message,
        user_id: userId,
        created_at: comment.data?.created_at || new Date().toISOString(),
        updated_at: comment.data?.updated_at || new Date().toISOString(),
        custom: comment.data?.custom,
      };
    } catch (error) {
      console.error('Error updating comment:', error);
      return null;
    }
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string, userId: string, userToken: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connectUser(userId, userToken);
      }

      await this.client.deleteComment({
        comment_id: commentId,
      });

      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      return false;
    }
  }

  /**
   * Add reaction to a comment
   */
  async addCommentReaction(commentId: string, userId: string, userToken: string, type: string): Promise<any> {
    try {
      if (!this.isConnected) {
        await this.connectUser(userId, userToken);
      }

      const reaction = await this.client.addCommentReaction({
        comment_id: commentId,
        type: type,
      });

      return reaction;
    } catch (error) {
      console.error('Error adding comment reaction:', error);
      return null;
    }
  }

  /**
   * Remove reaction from a comment
   */
  async deleteCommentReaction(commentId: string, userId: string, userToken: string, type: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connectUser(userId, userToken);
      }

      await this.client.deleteCommentReaction({
        comment_id: commentId,
        type: type,
      });

      return true;
    } catch (error) {
      console.error('Error deleting comment reaction:', error);
      return false;
    }
  }

  /**
   * Disconnect from GetStream
   */
  async disconnect(): Promise<void> {
    try {
      // Note: The FeedsClient might not have a disconnect method
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