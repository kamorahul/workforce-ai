import express, { Request, Response, Router } from 'express';
import { getStreamFeedsService } from '../utils/getstreamFeedsService';

const router: Router = express.Router();

// Get notifications for a user
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      res.status(400).json({ error: 'Missing required query parameter: userId' });
      return;
    }

    // Get notifications from GetStream Activity Feeds
    try {
      const notifications = await getStreamFeedsService.getUserNotifications(userId as string, 50);
      
      if (notifications && notifications.length > 0) {
        const formattedNotifications = notifications.map((notification: any) => ({
          id: notification.id,
          category: getNotificationCategory(notification),
          type: notification.verb || 'system',
          title: getNotificationTitle(notification),
          message: getNotificationMessage(notification),
          timestamp: notification.time || notification.created_at,
          isRead: notification.isRead || false,
          taskId: notification.extra?.taskId,
          commentId: notification.extra?.commentId,
          userId: notification.actor || notification.extra?.assigneeId || 'system',
          channelId: notification.extra?.channelId,
          locationId: notification.extra?.locationId,
          eventId: notification.extra?.eventId,
          icon: getNotificationIcon(notification),
          avatar: notification.actor || notification.extra?.assigneeId || 'system'
        }));

        res.status(200).json({ 
          status: 'success', 
          notifications: formattedNotifications,
          source: 'getstream'
        });
      } else {
        // Return empty array if no notifications
        res.status(200).json({ 
          status: 'success', 
          notifications: [],
          source: 'getstream'
        });
      }
    } catch (error) {
      console.error('Error fetching notifications from GetStream:', error);
      res.status(500).json({ 
        error: 'Failed to fetch notifications from GetStream',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark a notification as read
router.patch('/:notificationId/read', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      res.status(400).json({ error: 'Missing required parameter: notificationId' });
      return;
    }

    try {
      // Mark notification as read in GetStream
      await getStreamFeedsService.markNotificationAsRead(notificationId);
      res.status(200).json({ status: 'success', message: 'Notification marked as read' });
    } catch (error) {
      console.error('Error marking notification as read in GetStream:', error);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read for a user
router.patch('/mark-all-read', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'Missing required field: userId' });
      return;
    }

    try {
      // Mark all notifications as read in GetStream
      await getStreamFeedsService.markAllNotificationsAsRead(userId);
      res.status(200).json({ status: 'success', message: 'All notifications marked as read' });
    } catch (error) {
      console.error('Error marking all notifications as read in GetStream:', error);
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Helper function to determine notification category
const getNotificationCategory = (notification: any): string => {
  const verb = notification.verb;
  const extra = notification.extra || {};

  if (verb === 'task_assigned' || verb === 'task_completed' || verb === 'task_updated') {
    return 'tasks_projects';
  } else if (verb === 'comment_added' || verb === 'mention' || verb === 'message') {
    return 'chat_messaging';
  } else if (verb === 'event_created' || verb === 'event_updated' || verb === 'event_reminder') {
    return 'calendar_reminder';
  } else if (verb === 'location_checkin' || verb === 'attendance_marked') {
    return 'location_attendance';
  } else {
    return 'activity';
  }
};

// Helper function to get notification icon
const getNotificationIcon = (notification: any): string => {
  const verb = notification.verb;
  
  switch (verb) {
    case 'task_assigned':
      return 'list-outline';
    case 'task_completed':
      return 'checkmark-circle-outline';
    case 'comment_added':
      return 'chatbubble-outline';
    case 'mention':
      return 'at-outline';
    case 'event_created':
    case 'event_reminder':
      return 'calendar-outline';
    case 'location_checkin':
      return 'location-outline';
    case 'attendance_marked':
      return 'time-outline';
    default:
      return 'notifications-outline';
  }
};

// Helper function to generate notification title
const getNotificationTitle = (notification: any): string => {
  const verb = notification.verb;
  const extra = notification.extra || {};

  switch (verb) {
    case 'task_assigned':
      return 'New Task Assigned';
    case 'task_completed':
      return 'Task Completed';
    case 'comment_added':
      return 'New Comment on Task';
    case 'mention':
      return 'You were mentioned';
    case 'task_updated':
      return 'Task Updated';
    case 'event_created':
      return 'New Event Created';
    case 'event_reminder':
      return 'Event Reminder';
    case 'location_checkin':
      return 'Location Check-in';
    case 'attendance_marked':
      return 'Attendance Marked';
    case 'system':
      return extra.title || 'System Notification';
    default:
      return 'New Notification';
  }
};

// Helper function to generate notification message
const getNotificationMessage = (notification: any): string => {
  const verb = notification.verb;
  const extra = notification.extra || {};
  const actor = notification.actor || extra.assigneeId || 'System';

  switch (verb) {
    case 'task_assigned':
      return `${actor} assigned you a new task: "${extra.taskName || 'Untitled Task'}"`;
    case 'task_completed':
      return `Task "${extra.taskName || 'Untitled Task'}" has been marked as completed`;
    case 'comment_added':
      return `${actor} commented on your task: "${extra.commentPreview || 'New comment'}"`;
    case 'mention':
      return `${actor} mentioned you in a comment: "${extra.mentionText || '@mention'}"`;
    case 'task_updated':
      return `Task "${extra.taskName || 'Untitled Task'}" has been updated`;
    case 'event_created':
      return `${actor} created a new event: "${extra.eventName || 'Untitled Event'}"`;
    case 'event_reminder':
      return `Reminder: "${extra.eventName || 'Untitled Event'}" starts in ${extra.timeRemaining || 'soon'}`;
    case 'location_checkin':
      return `${actor} checked in at ${extra.locationName || 'location'}`;
    case 'attendance_marked':
      return `${actor} marked attendance for ${extra.eventName || 'event'}`;
    case 'system':
      return extra.message || 'System notification';
    default:
      return 'You have a new notification';
  }
};

export default router;
