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
      const notifications = await getStreamFeedsService.getUserNotifications(userId as string, 100);
      
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

  if (verb === 'task_assigned' || verb === 'task_completed' || verb === 'task_updated' ||
      verb === 'task_priority_changed' || verb === 'task_date_changed' || verb === 'task_description_changed' ||
      verb === 'task_status_changed' || verb === 'task_name_changed' || verb === 'task_unassigned') {
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
    case 'task_priority_changed':
      return 'flag-outline';
    case 'task_date_changed':
      return 'calendar-outline';
    case 'task_description_changed':
      return 'document-text-outline';
    case 'task_status_changed':
      return 'checkmark-done-outline';
    case 'task_name_changed':
      return 'create-outline';
    case 'task_unassigned':
      return 'person-remove-outline';
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
    case 'task_priority_changed':
      return 'Task Priority Changed';
    case 'task_date_changed':
      return 'Task Due Date Changed';
    case 'task_description_changed':
      return 'Task Description Updated';
    case 'task_status_changed':
      return 'Task Status Changed';
    case 'task_name_changed':
      return 'Task Name Changed';
    case 'task_unassigned':
      return 'Task Unassigned';
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
      if (extra.action === 'commented') {
        return `You commented on task: "${extra.taskName || 'Untitled Task'}"`;
      } else if (extra.isTaskCreator) {
        return `${actor} commented on your created task: "${extra.commentPreview || 'New comment'}"`;
      } else {
        return `${actor} commented on your assigned task: "${extra.commentPreview || 'New comment'}"`;
      }
    case 'mention':
      return `${actor} mentioned you in a comment: "${extra.message || '@mention'}"`;
    case 'task_priority_changed':
      return `${actor} changed priority from "${extra.oldPriority || 'unknown'}" to "${extra.newPriority || 'unknown'}" for task: "${extra.taskName || 'Untitled Task'}"`;
    case 'task_date_changed':
      return `${actor} changed due date from "${new Date(extra.oldDate).toLocaleDateString()}" to "${new Date(extra.newDate).toLocaleDateString()}" for task: "${extra.taskName || 'Untitled Task'}"`;
    case 'task_description_changed':
      return `${actor} updated description for task: "${extra.taskName || 'Untitled Task'}"`;
    case 'task_status_changed':
      return `${actor} changed status from "${extra.oldStatus || 'unknown'}" to "${extra.newStatus || 'unknown'}" for task: "${extra.taskName || 'Untitled Task'}"`;
    case 'task_name_changed':
      return `${actor} renamed task from "${extra.oldName || 'Untitled Task'}" to "${extra.newName || 'Untitled Task'}"`;
    case 'task_unassigned':
      return `${actor} unassigned you from task: "${extra.taskName || 'Untitled Task'}"`;
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

// Register device token for push notifications
router.post('/device-token', async (req: Request, res: Response) => {
  try {
    const { userId, deviceToken, platform, providerName } = req.body;

    if (!userId || !deviceToken || !platform) {
      res.status(400).json({ 
        error: 'Missing required fields: userId, deviceToken, or platform' 
      });
      return;
    }

    // Validate platform
    if (!['apn', 'firebase', 'webpush'].includes(platform)) {
      res.status(400).json({ 
        error: 'Invalid platform. Must be one of: apn, firebase, webpush' 
      });
      return;
    }

    console.log(`🔔 Registering ${platform} device token for user:`, userId);

    try {
      // Import and use device token service
      const { deviceTokenService } = await import('../utils/deviceTokenService');
      
      // Register device with Stream
      await deviceTokenService.registerDevice(
        userId, 
        deviceToken, 
        platform as 'apn' | 'firebase' | 'webpush',
        providerName
      );
      
      console.log(`✅ ${platform} device token registered successfully for user:`, userId);
      
      res.status(200).json({ 
        status: 'success', 
        message: `${platform} device token registered successfully`,
        userId,
        platform,
        providerName
      });
    } catch (error) {
      console.error(`❌ Error registering ${platform} device token:`, error);
      res.status(500).json({ 
        error: `Failed to register ${platform} device token`,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('❌ Error in device token registration endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove device token
router.delete('/device-token', async (req: Request, res: Response) => {
  try {
    const { deviceToken } = req.body;

    if (!deviceToken) {
      res.status(400).json({ error: 'Missing required field: deviceToken' });
      return;
    }

    console.log('🗑️ Removing device token');

    try {
      const { deviceTokenService } = await import('../utils/deviceTokenService');
      
      await deviceTokenService.removeDevice(deviceToken);
      
      console.log('✅ Device token removed successfully');
      
      res.status(200).json({ 
        status: 'success', 
        message: 'Device token removed successfully'
      });
    } catch (error) {
      console.error('❌ Error removing device token:', error);
      res.status(500).json({ 
        error: 'Failed to remove device token',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('❌ Error in device token removal endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user devices
router.get('/device-token/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ error: 'Missing required parameter: userId' });
      return;
    }

    console.log(`📱 Getting devices for user:`, userId);

    try {
      const { deviceTokenService } = await import('../utils/deviceTokenService');
      
      const devices = await deviceTokenService.getUserDevices(userId);
      
      console.log(`✅ Retrieved ${devices.length} devices for user:`, userId);
      
      res.status(200).json({ 
        status: 'success', 
        devices,
        count: devices.length
      });
    } catch (error) {
      console.error(`❌ Error getting devices for user ${userId}:`, error);
      res.status(500).json({ 
        error: 'Failed to get user devices',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('❌ Error in get user devices endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy FCM token endpoint for backward compatibility
router.post('/fcm-token', async (req: Request, res: Response) => {
  try {
    const { userId, fcmToken, platform = 'firebase' } = req.body;

    if (!userId || !fcmToken) {
      res.status(400).json({ error: 'Missing required fields: userId or fcmToken' });
      return;
    }

    console.log('🔔 Registering FCM token for user:', userId);

    try {
      const { deviceTokenService } = await import('../utils/deviceTokenService');
      
      // Register device with Stream using firebase platform
      await deviceTokenService.registerDevice(
        userId, 
        fcmToken, 
        'firebase',
        'FCM_Provider'
      );
      
      console.log('✅ FCM token registered successfully for user:', userId);
      
      res.status(200).json({ 
        status: 'success', 
        message: 'FCM token registered successfully',
        userId,
        platform: 'firebase'
      });
    } catch (error) {
      console.error('❌ Error registering FCM token:', error);
      res.status(500).json({ 
        error: 'Failed to register FCM token',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('❌ Error in FCM token registration endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test direct push notification (no channels)
router.post('/test-direct-push', async (req: Request, res: Response) => {
  try {
    const { userId, title, message, data } = req.body;

    if (!userId || !title || !message) {
      res.status(400).json({ 
        error: 'Missing required fields: userId, title, or message' 
      });
      return;
    }

    console.log(`🧪 Testing direct push notification for user:`, userId);

    try {
      // Import and use direct push notification service
      const { directPushNotificationService } = await import('../utils/directPushNotificationService');
      
      // Send direct push notification
      await directPushNotificationService.sendDirectPushNotification(userId, {
        title,
        message,
        data: data || {},
        badge: 1,
        sound: 'default',
        category: 'test'
      });
      
      console.log(`✅ Direct push notification test sent to user:`, userId);
      
      res.status(200).json({ 
        status: 'success', 
        message: 'Direct push notification test sent successfully',
        userId,
        notificationTitle: title,
        notificationMessage: message
      });
    } catch (error) {
      console.error(`❌ Error sending direct push notification test:`, error);
      res.status(500).json({ 
        error: 'Failed to send direct push notification test',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('❌ Error in direct push notification test endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
