import { serverClient } from '../serverClient';

export interface PushNotificationPayload {
  title: string;
  message: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  category?: string;
}

export class DirectPushNotificationService {
  /**
   * Send push notification directly to user's devices
   * This bypasses channel creation and sends notifications directly
   */
  async sendDirectPushNotification(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<void> {
    try {
      console.log(`🔔 Sending direct push notification to user ${userId}: ${payload.title}`);
      
      // Method 1: Try to use Stream's direct push API (if available)
      try {
        await this.sendViaStreamDirectAPI(userId, payload);
        return;
      } catch (error) {
        console.log('Direct API not available, trying alternative method...');
      }
      
      // Method 2: Use a system notification approach
      await this.sendViaSystemNotification(userId, payload);
      
    } catch (error) {
      console.error(`❌ Failed to send direct push notification to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Method 1: Try to send via Stream's direct push API
   */
  private async sendViaStreamDirectAPI(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<void> {
    // This is a placeholder for Stream's direct push API
    // Currently, Stream doesn't have a direct push API without channels
    throw new Error('Direct push API not available');
  }

  /**
   * Method 2: Send via system notification channel (minimal approach)
   */
  private async sendViaSystemNotification(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<void> {
    try {
      console.log(`🔍 DEBUG: Starting system notification for user ${userId}`);
      console.log(`🔍 DEBUG: Payload:`, JSON.stringify(payload, null, 2));
      
      // Create a system-level notification that's immediately deleted
      const systemChannelId = `system_push_${Date.now()}`;
      console.log(`🔍 DEBUG: Creating system channel: ${systemChannelId}`);
      
      const channel = serverClient.channel('messaging', systemChannelId, {
        members: [userId],
        created_by_id: 'system',
        // Make it a system channel that won't appear in user's channel list
        extra: {
          isSystemChannel: true,
          isPushOnly: true,
          hidden: true
        }
      });

      // Create the channel
      console.log(`🔍 DEBUG: Creating channel...`);
      await channel.create();
      console.log(`🔍 DEBUG: Channel created successfully`);
      
      // Prepare message with enhanced push data
      const messageData = {
        text: payload.message,
        user: { id: 'system' },
        // Make the message hidden from chat UI
        extra: {
          ...payload.data,
          isSystemNotification: true,
          notificationTitle: payload.title,
          timestamp: new Date().toISOString(),
          pushOnly: true,
          // Enhanced push-specific data
          push: {
            title: payload.title,
            body: payload.message,
            badge: payload.badge || 1,
            sound: payload.sound || 'default',
            category: payload.category || 'general',
            data: payload.data || {},
            // Additional push properties
            priority: 'high',
            visibility: 'public',
            icon: 'ic_notification',
            color: '#FF0000',
            click_action: 'OPEN_NOTIFICATION_SCREEN'
          }
        }
      };
      
      console.log(`🔍 DEBUG: Sending message with data:`, JSON.stringify(messageData, null, 2));
      
      // Send the notification message
      const result = await channel.sendMessage(messageData);
      console.log(`🔍 DEBUG: Message sent successfully:`, result);
      console.log(`✅ System notification sent for push: ${payload.title}`);
      
      // Delete the channel immediately to keep it clean
      console.log(`🔍 DEBUG: Deleting channel...`);
      await channel.delete();
      console.log(`🗑️ System notification channel cleaned up`);
      
    } catch (error) {
      console.error(`❌ System notification failed:`, error);
      console.error(`🔍 DEBUG: Full error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        code: (error as any)?.code || 'No code',
        response: (error as any)?.response?.data || 'No response data'
      });
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
    console.log(`🔔 Sending bulk push notifications to ${userIds.length} users`);
    
    const promises = userIds.map(userId => 
      this.sendDirectPushNotification(userId, payload)
    );
    
    await Promise.allSettled(promises);
    console.log(`✅ Bulk push notifications completed`);
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
