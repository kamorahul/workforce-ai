import { serverClient } from '../serverClient';
import type { DefaultGenerics, StreamChat, PushProvider } from 'stream-chat';

export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: 'apn' | 'firebase' | 'webpush';
  providerName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class DeviceTokenService {
  /**
   * Register a device token with Stream for push notifications
   */
  async registerDevice(
    userId: string, 
    deviceToken: string, 
    platform: 'apn' | 'firebase' | 'webpush',
    providerName?: string
  ): Promise<void> {
    try {
      console.log(`🔔 Registering device for user ${userId} with ${platform} token`);
      
      // Register device with Stream
      await (serverClient as StreamChat<DefaultGenerics>).addDevice(
        deviceToken,
        platform as any,
        userId,
        providerName || `${platform}_provider`
      );
      
      console.log(`✅ Device registered successfully for user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to register device for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a device token from Stream
   */
  async removeDevice(deviceToken: string): Promise<void> {
    try {
      console.log(`🗑️ Removing device token: ${deviceToken.substring(0, 10)}...`);
      
      await (serverClient as StreamChat<DefaultGenerics>).removeDevice(deviceToken);
      
      console.log(`✅ Device token removed successfully`);
    } catch (error) {
      console.error(`❌ Failed to remove device token:`, error);
      throw error;
    }
  }

  /**
   * Get all devices for a user
   */
  async getUserDevices(userId: string): Promise<any[]> {
    try {
      const response = await (serverClient as StreamChat<DefaultGenerics>).getDevices(userId);
      return response.devices || [];
    } catch (error) {
      console.error(`❌ Failed to get devices for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Update device token (remove old, add new)
   */
  async updateDeviceToken(
    userId: string,
    oldToken: string,
    newToken: string,
    platform: 'apn' | 'firebase' | 'webpush',
    providerName?: string
  ): Promise<void> {
    try {
      console.log(`🔄 Updating device token for user ${userId}`);
      
      // Remove old token
      await this.removeDevice(oldToken);
      
      // Add new token
      await this.registerDevice(userId, newToken, platform, providerName);
      
      console.log(`✅ Device token updated successfully for user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to update device token for user ${userId}:`, error);
      throw error;
    }
  }
}

export const deviceTokenService = new DeviceTokenService();
