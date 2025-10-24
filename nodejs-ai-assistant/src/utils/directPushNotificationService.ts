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
      // Get user's devices
      const devices = await deviceTokenService.getUserDevices(userId);
      
      if (!devices || devices.length === 0) {
        return;
      }
      
      // Send push notification via Stream's push API
      await this.sendPushViaStream(userId, payload, devices);
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
          
          // Ensure taskId is in data for navigation
          if (payload.data?.taskId) {
            stringData.taskId = String(payload.data.taskId);
          }
          if (payload.data?.channelId) {
            stringData.channelId = String(payload.data.channelId);
          }
          
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
          await messaging.send(message);
        } catch (deviceError: any) {
          console.error(`❌ FCM push failed for device ${device.id?.substring(0, 10)}:`, deviceError.message);
        }
      });
      
      await Promise.allSettled(pushPromises);
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
      const promises = userIds.map(userId => 
        this.sendDirectPushNotification(userId, payload)
      );
      
      await Promise.allSettled(promises);
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
      } catch (error) {
        console.error(`❌ Failed to send scheduled push notification to user ${userId}:`, error);
      }
    }, delay);
  }
}

export const directPushNotificationService = new DirectPushNotificationService();
