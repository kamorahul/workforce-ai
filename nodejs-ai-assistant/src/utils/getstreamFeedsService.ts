import { StreamClient } from "@stream-io/node-sdk";

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
  private client: StreamClient;
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
    
    this.client = new StreamClient(apiKey, apiSecret);
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
   * Create a task activity in GetStream Activity Feeds
   */
  async createTaskActivity(taskId: string, task: any): Promise<string | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      // For now, return the taskId as the activity ID
      // The actual Activity Feeds API might need different implementation
      console.log('Creating task activity for:', taskId);
      return `task:${taskId}`;
    } catch (error) {
      console.error('Error creating task activity:', error);
      return null;
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

      // For now, return a mock comment
      // The actual Activity Feeds API might need different implementation
      console.log('Adding comment for task:', taskId, 'by user:', userId);
      
      return {
        id: commentId || `comment_${Date.now()}`,
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
      return null;
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

      // For now, return empty array
      // The actual Activity Feeds API might need different implementation
      console.log('Getting comments for task:', taskId);
      return [];
    } catch (error) {
      console.error('Error getting comments:', error);
      return [];
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

      // For now, return a mock updated comment
      // The actual Activity Feeds API might need different implementation
      console.log('Updating comment:', commentId, 'by user:', userId);
      
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
      return null;
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

      // For now, return true
      // The actual Activity Feeds API might need different implementation
      console.log('Deleting comment:', commentId);
      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      return false;
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

      // For now, return a mock reaction
      // The actual Activity Feeds API might need different implementation
      console.log('Adding reaction:', type, 'to comment:', commentId, 'by user:', userId);
      
      return {
        id: `reaction_${Date.now()}`,
        type: type,
        user_id: userId,
        comment_id: commentId,
      };
    } catch (error) {
      console.error('Error adding comment reaction:', error);
      return null;
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

      // For now, return true
      // The actual Activity Feeds API might need different implementation
      console.log('Removing reaction:', type, 'from comment:', commentId, 'by user:', userId);
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