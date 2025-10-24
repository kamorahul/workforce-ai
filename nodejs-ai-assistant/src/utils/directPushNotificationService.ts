import { serverClient } from '../serverClient';
import { deviceTokenService } from './deviceTokenService';

export interface PushNotificationPayload {
  title: string;
  message: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  category?: string;
}

export interface SimpleNotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: 'task' | 'comment' | 'event' | 'system';
  data?: Record<string, any>;
}

export interface GroupNotificationPayload {
  userIds: string[];
  title: string;
  message: string;
  type: 'task' | 'comment' | 'event' | 'system';
  data?: Record<string, any>;
}

export class DirectPushNotificationService {
  /**
   * Send simple notification to a single user
   */
  async sendSimpleNotification(payload: SimpleNotificationPayload): Promise<void> {
    try {
      console.log(`🔔 Sending simple notification to user ${payload.userId}: ${payload.title}`);
      
      // Create push notification payload
      const pushPayload: PushNotificationPayload = {
        title: payload.title,
        message: payload.message,
        data: {
          type: payload.type,
          userId: payload.userId,
          ...payload.data
        },
        badge: 1,
        sound: 'default',
        category: payload.type
      };
      
      // Send push notification
      await this.sendDirectPushNotification(payload.userId, pushPayload);
      
      console.log(`✅ Simple notification sent to user ${payload.userId}`);
    } catch (error) {
      console.error(`❌ Failed to send simple notification to user ${payload.userId}:`, error);
      throw error;
    }
  }

  /**
   * Send group notification to multiple users
   */
  async sendGroupNotification(payload: GroupNotificationPayload): Promise<void> {
    try {
      console.log(`🔔 Sending group notification to ${payload.userIds.length} users: ${payload.title}`);
      
      const promises = payload.userIds.map(userId => 
        this.sendSimpleNotification({
          userId,
          title: payload.title,
          message: payload.message,
          type: payload.type,
          data: payload.data
        })
      );
      
      await Promise.allSettled(promises);
      console.log(`✅ Group notification sent to ${payload.userIds.length} users`);
    } catch (error) {
      console.error(`❌ Failed to send group notification:`, error);
      throw error;
    }
  }

  /**
   * Send push notification directly to user's devices via Stream
   */
  async sendDirectPushNotification(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<void> {
    try {
      console.log(`🔔 Sending push notification to user ${userId}: ${payload.title}`);
      
      // Get user's devices
      const devices = await deviceTokenService.getUserDevices(userId);
      
      if (!devices || devices.length === 0) {
        console.log(`📱 No devices found for user ${userId}, skipping push notification`);
        return;
      }
      
      console.log(`📱 Found ${devices.length} devices for user ${userId}`);
      
      // Send push notification via Stream's push API
      await this.sendPushViaStream(userId, payload, devices);
      
      console.log(`✅ Push notification sent to user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to send push notification to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging (direct, no channel creation)
   */
  private async sendPushViaStream(
    userId: string,
    payload: PushNotificationPayload,
    devices: any[]
  ): Promise<void> {
    try {
      // Import Firebase Admin SDK
      const { messaging } = await import('../config/firebase');
      
      console.log(`📱 Sending FCM push notification to user ${userId}:`, {
        title: payload.title,
        body: payload.message,
        devices: devices.length
      });
      
      // Send push notification to each device token
      const pushPromises = devices.map(async (device) => {
        try {
          const deviceToken = device.id; // Device token from Stream
          
          // Convert all data values to strings (FCM requirement)
          const stringData: Record<string, string> = {};
          if (payload.data) {
            for (const [key, value] of Object.entries(payload.data)) {
              stringData[key] = typeof value === 'string' ? value : JSON.stringify(value);
            }
          }
          stringData.type = payload.category || 'task';
          stringData.timestamp = new Date().toISOString();
          
          // Create FCM message
          const message = {
            token: deviceToken,
            notification: {
              title: payload.title,
              body: payload.message,
            },
            data: stringData, // All values must be strings
            android: {
              priority: 'high' as const,
              notification: {
                sound: payload.sound || 'default',
                channelId: 'task_notifications',
              }
            },
            apns: {
              payload: {
                aps: {
                  alert: {
                    title: payload.title,
                    body: payload.message,
                  },
                  badge: payload.badge || 1,
                  sound: payload.sound || 'default',
                }
              }
            }
          };
          
          // Send via Firebase Cloud Messaging
          const response = await messaging.send(message);
          console.log(`✅ FCM push sent to device ${deviceToken.substring(0, 10)}...: ${response}`);
        } catch (deviceError: any) {
          console.error(`❌ Failed to send FCM push to device ${device.id?.substring(0, 10)}:`, deviceError.message);
        }
      });
      
      await Promise.allSettled(pushPromises);
      
      console.log(`✅ FCM push notifications sent to user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to send FCM push for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Send bulk push notifications to multiple users
   */
  async sendBulkPushNotifications(
    userIds: string[],
    payload: PushNotificationPayload
  ): Promise<void> {
    try {
      console.log(`🔔 Sending bulk push notifications to ${userIds.length} users: ${payload.title}`);
      
      const promises = userIds.map(userId => 
        this.sendDirectPushNotification(userId, payload)
      );
      
      await Promise.allSettled(promises);
      console.log(`✅ Bulk push notifications completed for ${userIds.length} users`);
    } catch (error) {
      console.error(`❌ Failed to send bulk push notifications:`, error);
      throw error;
    }
  }

  /**
   * Send scheduled push notification
   */
  async sendScheduledPushNotification(
    userId: string,
    payload: PushNotificationPayload,
    scheduledTime: Date
  ): Promise<void> {
    const delay = scheduledTime.getTime() - Date.now();
    
    if (delay <= 0) {
      // Send immediately if scheduled time has passed
      await this.sendDirectPushNotification(userId, payload);
      return;
    }
    
    // Schedule the notification
    setTimeout(async () => {
      try {
        await this.sendDirectPushNotification(userId, payload);
        console.log(`✅ Scheduled push notification sent to user ${userId}`);
      } catch (error) {
        console.error(`❌ Failed to send scheduled push notification to user ${userId}:`, error);
      }
    }, delay);
    
    console.log(`⏰ Push notification scheduled for user ${userId} at ${scheduledTime.toISOString()}`);
  }
}

export const directPushNotificationService = new DirectPushNotificationService();
