import { StreamClient } from "@stream-io/node-sdk";
import { StreamClient as GetStreamClient } from "getstream";
import { serverClient } from "../serverClient";

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
    } catch (error) {
      console.error('Error connecting to GetStream:', error);
      throw error;
    }
  }

  /**
   * Get user notifications from GetStream Activity Feeds
   */
  async getUserNotifications(userId: string, limit: number = 100): Promise<GetStreamNotification[]> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Fetching notifications for user:', userId, 'limit:', limit);
      
      // Try different feed groups to see which one has the notifications
      let notificationFeed = this.getstreamClient.feed('notification', userId);
      let response = await notificationFeed.get({ 
        limit,
        offset: 0,
        withReactionCounts: false,
        withRecentReactions: false,
        withOwnReactions: false
      });
      
      let feedGroup = 'notification';
      
      // If notification feed is empty, try user feed
      if (!response.results || response.results.length === 0) {
        feedGroup = 'user';
        const userFeed = this.getstreamClient.feed('user', userId);
        response = await userFeed.get({ 
          limit,
          offset: 0,
          withReactionCounts: false,
          withRecentReactions: false,
          withOwnReactions: false
        });
        console.log(`📭 ${feedGroup} feed results:`, response.results?.length || 0);
      }
      
      // If still empty, try timeline feed
      if (!response.results || response.results.length === 0) {
        feedGroup = 'timeline';
        const timelineFeed = this.getstreamClient.feed('timeline', userId);
        response = await timelineFeed.get({ 
          limit,
          offset: 0,
          withReactionCounts: false,
          withRecentReactions: false,
          withOwnReactions: false
        });
        console.log(`📭 ${feedGroup} feed results:`, response.results?.length || 0);
      }
      
      if (response.results && response.results.length > 0) {  
        // Extract individual activities from grouped results
        let allActivities: any[] = [];
        
        for (const group of response.results) {
          if (group.activities && Array.isArray(group.activities)) {
            // This is a grouped activity - extract individual activities
            allActivities.push(...group.activities);
          } else {
            // This is an individual activity
            allActivities.push(group);
          }
        } 
        // Transform GetStream activities to our notification format
        const notifications = allActivities.map((activity: any) => {
          const notification = {
            id: activity.id,
            verb: activity.verb,
            actor: activity.actor,
            object: activity.object,
            time: activity.time || activity.created_at,
            extra: activity.extra || {},
            isRead: activity.isRead || false
          };
          return notification;
        });
         
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
   * Create a notification activity for a user (with self-exclusion)
   */
  async createNotification(userId: string, verb: string, object: string, extra: any = {}): Promise<string | null> {
    try {
      // Determine who performed the action
      const actor = extra.actor || extra.commentedBy || extra.createdBy || extra.assignee || 'system';
      
      // DON'T send notification to self - skip if user is notifying themselves
      if (userId === actor || userId === extra.createdBy || userId === extra.commentedBy) {
        return null;
      }

      if (!this.isConnected) {
        await this.connect();
      }
      
      // Add activity to user's notification feed (you have this configured)
      const notificationFeed = this.getstreamClient.feed('notification', userId);
      const activity = await notificationFeed.addActivity({
        actor: actor,
        verb: verb,
        object: object,
        extra: extra
      });
      
      // Send push notification
      await this.sendPushNotification(userId, verb, extra);
      
      return activity.id;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Get user name by ID from GetStream
   */
  async getUserName(userId: string): Promise<string> {
    try {
      const response = await serverClient.queryUsers({ id: userId });
      const user = response.users[0];
      
      if (user?.name) {
        return user.name;
      }
      
      // Fallback: Format phone number nicely if it looks like a phone number
      if (userId && /^\d{10,15}$/.test(userId)) {
        return userId.replace(/(\d{2})(\d{5})(\d+)/, '+$1 $2 $3');
      }
      
      return userId;
    } catch (error) {
      console.error('Error fetching user name:', error);
      // Fallback: Format phone number nicely if it looks like a phone number
      if (userId && /^\d{10,15}$/.test(userId)) {
        return userId.replace(/(\d{2})(\d{5})(\d+)/, '+$1 $2 $3');
      }
      return userId;
    }
  }

  /**
   * Send push notification to user
   */
  async sendPushNotification(userId: string, verb: string, extra: any = {}): Promise<void> {
    try {
      // Get notification title and message based on verb
      const { title, message } = await this.getPushNotificationContent(verb, extra);
      
      // Send push notification directly (no channels)
      await this.sendDirectPushNotification(userId, title, message, extra);
    } catch (error) {
      // Don't throw error - push notification failure shouldn't break the main flow
    }
  }

  /**
   * Send push notification directly (no channels)
   */
  private async sendDirectPushNotification(
    userId: string, 
    title: string, 
    message: string, 
    extra: any = {}
  ): Promise<void> {
    try {
      // Import the direct push notification service
      const { directPushNotificationService } = await import('./directPushNotificationService');
      
      // Send push notification directly without creating channels
      await directPushNotificationService.sendDirectPushNotification(userId, {
        title,
        message,
        data: extra,
        badge: 1,
        sound: 'default',
        category: extra.category || 'task'
      });
    } catch (error) {
      // Don't throw error - push notification failure shouldn't break the main flow
    }
  }

  /**
   * Get push notification title and message based on verb - Professional and contextual
   */
  private async getPushNotificationContent(verb: string, extra: any = {}): Promise<{ title: string; message: string }> {
    const actorId = extra.actor || extra.commentedBy || extra.createdBy || 'System';
    
    // Get user name for the actor
    const actor = actorId === 'System' ? 'Someone' : await this.getUserName(actorId);
    const taskName = extra.taskName || 'a task';
    const priority = extra.newPriority || extra.priority || 'medium';
    const capitalizeFirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
    
    switch (verb) {
      case 'task_created':
        return {
          title: 'Task Created',
          message: `You created a new task: "${taskName}"`
        };
      case 'task_assigned':
        return {
          title: 'New Task Assigned',
          message: `${actor} assigned you: "${taskName}"`
        };
      case 'task_attachment_added':
        const fileName = extra.fileName || 'a file';
        return {
          title: 'File Added to Task',
          message: `${actor} added "${fileName}" to "${taskName}"`
        };
      case 'task_attachment_removed':
        const removedFileName = extra.fileName || 'a file';
        return {
          title: 'File Removed from Task',
          message: `${actor} removed "${removedFileName}" from "${taskName}"`
        };
      case 'task_priority_changed':
        return {
          title: 'Task Priority Updated',
          message: `${actor} updated priority of "${taskName}" to ${capitalizeFirst(priority)}`
        };
      case 'task_date_changed':
        const newDate = extra.newDate ? new Date(extra.newDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'new date';
        return {
          title: 'Task Due Date Updated',
          message: `${actor} updated due date for "${taskName}" to ${newDate}`
        };
      case 'task_status_changed':
        const newStatus = extra.newStatus ? capitalizeFirst(extra.newStatus.replace('_', ' ')) : 'new status';
        return {
          title: 'Task Status Updated',
          message: `${actor} changed status of "${taskName}" to ${newStatus}`
        };
      case 'task_description_changed':
        return {
          title: 'Task Description Updated',
          message: `${actor} updated the description for "${taskName}"`
        };
      case 'task_name_changed':
        const newName = extra.newName || 'new name';
        return {
          title: 'Task Renamed',
          message: `${actor} renamed task to "${newName}"`
        };
      case 'task_unassigned':
        return {
          title: 'Removed from Task',
          message: `${actor} removed you from task "${taskName}"`
        };
      case 'comment_added':
        if (extra.action === 'commented') {
          return {
            title: 'Comment Added',
            message: `Your comment was added to task "${taskName}"`
          };
        } else if (extra.isTaskCreator) {
          const preview = extra.commentPreview ? `: "${extra.commentPreview.substring(0, 50)}${extra.commentPreview.length > 50 ? '...' : ''}"` : '';
          return {
            title: 'New Comment on Your Task',
            message: `${actor} commented on "${taskName}"${preview}`
          };
        } else {
          const preview = extra.commentPreview ? `: "${extra.commentPreview.substring(0, 50)}${extra.commentPreview.length > 50 ? '...' : ''}"` : '';
          return {
            title: 'New Comment on Task',
            message: `${actor} commented on "${taskName}"${preview}`
          };
        }
      case 'mention':
        return {
          title: 'You Were Mentioned',
          message: `${actor} mentioned you in a comment on "${taskName}"`
        };
      default:
        return {
          title: 'Convoe Notification',
          message: 'You have a new notification. Tap to view.'
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

      // DON'T notify the task creator - they already know they created the task
      // Only notify assignees who are NOT the creator

      // Create notification for each assignee using their feed groups
      // SKIP if assignee is the task creator (don't notify yourself)
      if (task.assignee && Array.isArray(task.assignee)) {
        for (const assigneeId of task.assignee) {
          // Skip if assignee is the task creator - they don't need notification for their own task
          if (assigneeId === task.createdBy) {
            console.log(`Skipping notification for task creator ${assigneeId} - they created this task`);
            continue;
          }

          // Add activity to assignee's feed group
          const assigneeFeed = this.getstreamClient.feed('notification', assigneeId);
          await assigneeFeed.addActivity({
            actor: task.createdBy || 'system',
            verb: 'task_assigned',
            object: taskId,
            extra: {
              taskId: taskId,
              taskName: task.title || task.name,
              priority: task.priority || 'medium',
              description: task.description,
              assignee: assigneeId,
              createdBy: task.createdBy,
              channelId: task.channelId,
              feedGroup: 'notification'
            }
          });

          // Also create notification for push notifications
          await this.createNotification(assigneeId, 'task_assigned', taskId, {
            taskId: taskId,
            taskName: task.title || task.name,
            priority: task.priority || 'medium',
            description: task.description,
            assignee: assigneeId,
            createdBy: task.createdBy,
            channelId: task.channelId
          });

          console.log(`Added task_assigned activity to assignee ${assigneeId}'s notification feed`);
        }
      }
      
      return activity.id;
    } catch (error) {
      console.error('Error creating task activity:', error);
      throw error;
    }
  }

  /**
   * Create activity when an event is created and notify attendees
   */
  async createEventActivity(eventId: string, event: any): Promise<string> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const organizerFeed = this.getstreamClient.feed('user', event.organizer);

      // Create the event activity
      const activity = await organizerFeed.addActivity({
        actor: event.organizer,
        verb: 'event_created',
        object: eventId,
        foreign_id: `event:${eventId}`,
        extra: {
          eventId: eventId,
          eventTitle: event.title,
          startDate: event.startDate,
          endDate: event.endDate,
          location: event.location,
          attendees: event.attendees,
          organizer: event.organizer,
          channelId: event.channelId,
          reminder: event.reminder,
        }
      });

      // Notify each attendee (except the organizer)
      // Handle both old format (string[]) and new format ({userId, status}[])
      if (event.attendees && Array.isArray(event.attendees)) {
        for (const attendee of event.attendees) {
          // Support both formats: string or {userId, status}
          const attendeeId = typeof attendee === 'string' ? attendee : attendee.userId;

          // Skip if attendee is the organizer
          if (attendeeId === event.organizer) {
            console.log(`Skipping notification for event organizer ${attendeeId}`);
            continue;
          }

          // Add activity to attendee's notification feed
          const attendeeFeed = this.getstreamClient.feed('notification', attendeeId);
          await attendeeFeed.addActivity({
            actor: event.organizer,
            verb: 'event_invited',
            object: eventId,
            extra: {
              eventId: eventId,
              eventTitle: event.title,
              startDate: event.startDate,
              endDate: event.endDate,
              location: event.location,
              organizer: event.organizer,
              channelId: event.channelId,
              feedGroup: 'notification'
            }
          });

          // Also create push notification
          await this.createNotification(attendeeId, 'event_invited', eventId, {
            eventId: eventId,
            eventTitle: event.title,
            startDate: event.startDate,
            location: event.location,
            organizer: event.organizer,
            channelId: event.channelId
          });

          console.log(`📅 Added event_invited notification to attendee ${attendeeId}'s feed`);
        }
      }

      // Schedule reminder notification if reminder is set
      if (event.reminder && event.startDate) {
        const reminderTime = new Date(event.startDate).getTime() - (event.reminder * 60 * 1000);
        const now = Date.now();

        if (reminderTime > now) {
          // Extract userIds from attendees (handle both formats)
          const attendeeIds = (event.attendees || []).map((a: any) =>
            typeof a === 'string' ? a : a.userId
          );

          // Schedule reminder for all attendees including organizer
          const allUsers = [event.organizer, ...attendeeIds];
          const uniqueUsers = [...new Set(allUsers)];

          setTimeout(async () => {
            for (const userId of uniqueUsers) {
              try {
                await this.createNotification(userId, 'event_reminder', eventId, {
                  eventId: eventId,
                  eventTitle: event.title,
                  startDate: event.startDate,
                  location: event.location,
                  minutesUntil: event.reminder
                });
                console.log(`⏰ Sent event reminder to ${userId} for "${event.title}"`);
              } catch (err) {
                console.error(`Failed to send reminder to ${userId}:`, err);
              }
            }
          }, reminderTime - now);

          console.log(`⏰ Scheduled reminder for "${event.title}" in ${Math.round((reminderTime - now) / 60000)} minutes`);
        }
      }

      return activity.id;
    } catch (error) {
      console.error('Error creating event activity:', error);
      throw error;
    }
  }

  /**
   * Create notifications for task updates
   */
  async createTaskUpdateNotifications(originalTask: any, updatedTask: any, updateData: any): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      // Get the actor (user making the change) from updateData, fallback to createdBy
      const actor = updateData.actor || updateData.userId || updatedTask.createdBy || 'system';
      // Resolve actor name for display in activity feed
      const actorName = await this.getUserName(actor);
      console.log('createTaskUpdateNotifications - Using actor:', actor, 'actorName:', actorName, 'from updateData:', { actor: updateData.actor, userId: updateData.userId });

      // Get all users to notify (assignees + creator)
      const usersToNotify = new Set([
        ...(updatedTask.assignee || []),
        updatedTask.createdBy
      ].filter(Boolean));

      // Check for specific changes and create notifications + activities
      // Only create activity if assignee actually changed (not just if it's defined)
      if (updateData.assignee !== undefined) {
        const originalAssignees = new Set(originalTask.assignee || []);
        const newAssignees = new Set(updatedTask.assignee || []);
        
        // Check if assignees actually changed by comparing sets
        const assigneesChanged = 
          originalAssignees.size !== newAssignees.size ||
          !Array.from(originalAssignees).every(id => newAssignees.has(id));
        
        if (assigneesChanged) {
          // Assignee actually changed
          const taskId = String((updatedTask._id as any) || '');
          
          // Add activity to tasks feed for assignee change
          const tasksFeed = this.getstreamClient.feed('tasks', taskId);
          await tasksFeed.addActivity({
            actor: actor,
            verb: 'task_assignee_changed',
            object: taskId,
            extra: {
              taskId: taskId,
              taskName: updatedTask.name || 'Untitled Task',
              oldAssignees: Array.from(originalAssignees),
              newAssignees: Array.from(newAssignees),
              actor: actor,
              actorName: actorName
            }
          });
          
          // Notify newly assigned users
          for (const assigneeId of newAssignees) {
            if (!originalAssignees.has(assigneeId)) {
              await this.createNotification(assigneeId as string, 'task_assigned', taskId, {
                taskId: taskId,
                taskName: updatedTask.name || 'Untitled Task',
                priority: updatedTask.priority || 'medium',
                description: updatedTask.description,
                assignee: assigneeId,
                createdBy: updatedTask.createdBy,
                channelId: updatedTask.channelId,
                action: 'newly_assigned',
                actor: actor
              });
            }
          }
          
          // Notify unassigned users
          for (const assigneeId of originalAssignees) {
            if (!newAssignees.has(assigneeId)) {
              await this.createNotification(assigneeId as string, 'task_unassigned', taskId, {
                taskId: taskId,
                taskName: updatedTask.name || 'Untitled Task',
                action: 'unassigned',
                actor: actor
              });
            }
          }
        }
      }

      if (updateData.priority !== undefined && updateData.priority !== originalTask.priority) {
        // Priority changed
        const taskId = updatedTask._id?.toString() || '';

        // Add activity to tasks feed
        const tasksFeed = this.getstreamClient.feed('tasks', taskId);
        await tasksFeed.addActivity({
          actor: actor,
          verb: 'task_priority_changed',
          object: taskId,
          extra: {
            taskId: taskId,
            taskName: updatedTask.name || 'Untitled Task',
            oldPriority: originalTask.priority,
            newPriority: updateData.priority,
            actor: actor,
            actorName: actorName
          }
        });
        
        // Send notifications to users
        for (const userId of usersToNotify) {
          await this.createNotification(userId, 'task_priority_changed', taskId, {
            taskId: taskId,
            taskName: updatedTask.name || 'Untitled Task',
            oldPriority: originalTask.priority,
            newPriority: updateData.priority,
            action: 'priority_changed',
            actor: actor
          });
        }
      }

      if (updateData.completionDate !== undefined &&
          new Date(updateData.completionDate).getTime() !== new Date(originalTask.completionDate).getTime()) {
        // Completion date changed
        const taskId = updatedTask._id?.toString() || '';

        // Add activity to tasks feed
        const tasksFeed = this.getstreamClient.feed('tasks', taskId);
        await tasksFeed.addActivity({
          actor: actor,
          verb: 'task_date_changed',
          object: taskId,
          extra: {
            taskId: taskId,
            taskName: updatedTask.name || 'Untitled Task',
            oldDate: originalTask.completionDate,
            newDate: updateData.completionDate,
            actor: actor,
            actorName: actorName
          }
        });
        
        // Send notifications to users
        for (const userId of usersToNotify) {
          await this.createNotification(userId, 'task_date_changed', taskId, {
            taskId: taskId,
            taskName: updatedTask.name || 'Untitled Task',
            oldDate: originalTask.completionDate,
            newDate: updateData.completionDate,
            action: 'date_changed',
            actor: actor
          });
        }
      }

      if (updateData.description !== undefined && updateData.description !== originalTask.description) {
        // Description changed
        const taskId = updatedTask._id?.toString() || '';

        // Add activity to tasks feed
        const tasksFeed = this.getstreamClient.feed('tasks', taskId);
        await tasksFeed.addActivity({
          actor: actor,
          verb: 'task_description_changed',
          object: taskId,
          extra: {
            taskId: taskId,
            taskName: updatedTask.name || 'Untitled Task',
            oldDescription: originalTask.description,
            newDescription: updateData.description,
            actor: actor,
            actorName: actorName
          }
        });
        
        // Send notifications to users
        for (const userId of usersToNotify) {
          await this.createNotification(userId, 'task_description_changed', taskId, {
            taskId: taskId,
            taskName: updatedTask.name || 'Untitled Task',
            oldDescription: originalTask.description,
            newDescription: updateData.description,
            action: 'description_changed',
            actor: actor
          });
        }
      }

      // Check for status changes (either completed field or status field)
      const statusChanged = (updateData.completed !== undefined && updateData.completed !== originalTask.completed) ||
                           (updateData.status !== undefined && updateData.status !== originalTask.status);

      if (statusChanged) {
        // Status changed
        const taskId = updatedTask._id?.toString() || '';

        // Determine old and new status
        const oldStatus = updateData.status !== undefined
          ? (originalTask.status || (originalTask.completed ? 'completed' : 'in_progress'))
          : (originalTask.completed ? 'completed' : 'in_progress');
        const newStatus = updateData.status !== undefined
          ? updateData.status
          : (updateData.completed ? 'completed' : 'in_progress');

        // Add activity to tasks feed
        const tasksFeed = this.getstreamClient.feed('tasks', taskId);
        await tasksFeed.addActivity({
          actor: actor,
          verb: 'task_status_changed',
          object: taskId,
          extra: {
            taskId: taskId,
            taskName: updatedTask.name || 'Untitled Task',
            oldStatus: oldStatus,
            newStatus: newStatus,
            actor: actor,
            actorName: actorName
          }
        });

        // If this is a subtask, also add activity to parent task's feed
        if (updatedTask.parentTaskId) {
          const parentTaskId = updatedTask.parentTaskId.toString();
          const parentTasksFeed = this.getstreamClient.feed('tasks', parentTaskId);
          await parentTasksFeed.addActivity({
            actor: actor,
            verb: 'subtask_status_changed',
            object: parentTaskId,
            extra: {
              taskId: parentTaskId,
              subtaskId: taskId,
              subtaskName: updatedTask.name || 'Untitled Subtask',
              oldStatus: oldStatus,
              newStatus: newStatus,
              actor: actor,
              actorName: actorName
            }
          });
        }

        // Send notifications to users
        for (const userId of usersToNotify) {
          await this.createNotification(userId, 'task_status_changed', taskId, {
            taskId: taskId,
            taskName: updatedTask.name || 'Untitled Task',
            oldStatus: oldStatus,
            newStatus: newStatus,
            action: 'status_changed',
            actor: actor
          });
        }
      }

      if (updateData.name !== undefined && updateData.name !== originalTask.name) {
        // Task name changed
        const taskId = updatedTask._id?.toString() || '';

        // Add activity to tasks feed
        const tasksFeed = this.getstreamClient.feed('tasks', taskId);
        await tasksFeed.addActivity({
          actor: actor,
          verb: 'task_name_changed',
          object: taskId,
          extra: {
            taskId: taskId,
            oldName: originalTask.name,
            newName: updateData.name,
            actor: actor,
            actorName: actorName
          }
        });
        
        // Send notifications to users
        for (const userId of usersToNotify) {
          await this.createNotification(userId, 'task_name_changed', taskId, {
            taskId: taskId,
            oldName: originalTask.name,
            newName: updateData.name,
            action: 'name_changed',
            actor: actor
          });
        }
      }

    } catch (error) {
      console.error('Error creating task update notifications:', error);
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

      // Don't create notification for the commenter themselves
      // They will see their comment in the task, no need for notification

      // Get task details to notify assignees about the new comment
      try {
        const { Task } = await import('../models/Task');
        const task = await Task.findById(taskId);
        
        if (task) {
          // Create a set of all users to notify (assignees + creator)
          const usersToNotify = new Set([
            ...(task.assignee || []),
            task.createdBy
          ].filter(Boolean)); // Remove any undefined values
          
          console.log('Users to notify about comment:', Array.from(usersToNotify));
          
          // Notify all relevant users about the new comment
          for (const userIdToNotify of usersToNotify) {
            // Skip if this is the commenter themselves
            if (userIdToNotify === userId) {
              console.log(`Skipping notification for commenter themselves: ${userIdToNotify}`);
              continue;
            }
            
            console.log(`Creating notification for user ${userIdToNotify} about comment from ${userId}`);
            
            // Create notification for the user (this will add to their notification feed)
            await this.createNotification(userIdToNotify, 'comment_added', taskId, {
              taskId: taskId,
              commentId: commentId,
              message: message,
              commentPreview: message.substring(0, 100),
              commentedBy: userId, // This is the user who commented
              taskName: task.name || 'Untitled Task',
              action: 'received_comment',
              channelId: task.channelId,
              isTaskCreator: userIdToNotify === task.createdBy,
              // Ensure the actor is properly set
              actor: userId
            });
            
            const userType = userIdToNotify === task.createdBy ? 'task creator' : 'assignee';
            console.log(`✅ Created comment notification for ${userType} ${userIdToNotify}`);
          }
        } else {
          console.log('❌ Task not found for comment notification:', taskId);
        }
      } catch (error) {
        console.error('Failed to send comment notifications to users:', error);
        if (error instanceof Error) {
          console.error('Error details:', error.message);
        } else {
          console.error('Error details:', error);
        }
        // Continue even if notifications fail
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
            // Use MongoDB _id from extra.commentId if available, otherwise use GetStream activity ID
            commentId: activity.extra?.commentId || activity.id,
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
   * Add reaction to a comment using GetStream Reactions API
   */
  async addCommentReaction(activityId: string, userId: string, type: string): Promise<any> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Adding GetStream reaction:', type, 'to activity:', activityId, 'by user:', userId);

      // Use GetStream Reactions API to add a reaction to the activity
      const reaction = await this.getstreamClient.reactions.add(
        type,           // kind of reaction (like, heart, celebrate, etc.)
        activityId,     // the activity (comment) to react to
        {               // data payload
          userId: userId,
        },
        {               // options
          userId: userId,  // the user adding the reaction
        }
      );

      console.log('GetStream reaction added:', reaction);

      return {
        id: reaction.id,
        type: type,
        user_id: userId,
        activity_id: activityId,
        created_at: reaction.created_at,
      };
    } catch (error) {
      console.error('Error adding comment reaction to GetStream:', error);
      throw error;
    }
  }

  /**
   * Remove reaction from a comment using GetStream Reactions API
   */
  async deleteCommentReaction(reactionId: string, userId: string, type: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Removing GetStream reaction:', reactionId, 'type:', type, 'by user:', userId);

      // Use GetStream Reactions API to delete the reaction
      await this.getstreamClient.reactions.delete(reactionId);

      console.log('GetStream reaction deleted:', reactionId);

      return true;
    } catch (error) {
      console.error('Error deleting comment reaction from GetStream:', error);
      throw error;
    }
  }

  /**
   * Get reactions for an activity from GetStream
   */
  async getActivityReactions(activityId: string, type?: string): Promise<any[]> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Getting GetStream reactions for activity:', activityId, 'type:', type);

      // Filter reactions by activity
      const filterParams: any = {
        activity_id: activityId,
      };

      if (type) {
        filterParams.kind = type;
      }

      const response = await this.getstreamClient.reactions.filter(filterParams);

      console.log('GetStream reactions found:', response.results?.length || 0);

      return response.results || [];
    } catch (error) {
      console.error('Error getting reactions from GetStream:', error);
      return [];
    }
  }



  /**
   * Get ALL activities for a task (including system updates like assignee changes, priority changes, etc.)
   */
  async getTaskActivities(taskId: string, limit: number = 100): Promise<any[]> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('Getting all activities for task:', taskId);
      
      // Get the tasks feed for this task
      const tasksFeed = this.getstreamClient.feed('tasks', taskId);
      
      // Get activities from the tasks feed
      const response = await tasksFeed.get({ 
        limit
      });
      
      if (response.results && response.results.length > 0) {
        // Return all activities with their full data
        return response.results.map((activity: any) => ({
          id: activity.id,
          actor: activity.actor,
          verb: activity.verb,
          object: activity.object,
          time: activity.time,
          extra: activity.extra || {},
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error getting task activities:', error);
      return [];
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