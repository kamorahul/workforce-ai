/**
 * OpenClaw Gateway Client
 *
 * Connects to the OpenClaw gateway via WebSocket for multi-platform messaging.
 * Supports WhatsApp, Telegram, Discord, Slack, and more.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface OpenClawConfig {
  gateway: string;
  token?: string;
  clientId?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface OpenClawMessage {
  id: string;
  channel: string;      // 'whatsapp', 'telegram', etc.
  chatId: string;       // Chat/conversation ID
  userId: string;       // Sender's ID on the platform
  userName?: string;    // Sender's display name
  text: string;
  attachments?: OpenClawAttachment[];
  replyTo?: string;     // ID of message being replied to
  quotedText?: string;  // Text of quoted message
  timestamp: Date;
  isGroup: boolean;
  groupName?: string;
}

export interface OpenClawAttachment {
  type: 'image' | 'audio' | 'video' | 'document';
  url: string;
  mimeType?: string;
  fileName?: string;
  size?: number;
}

export interface OpenClawResponse {
  chatId: string;
  channel: string;
  text: string;
  attachments?: OpenClawAttachment[];
  replyToMessageId?: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: OpenClawConfig;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private reconnectAttempts = 0;
  private isConnected = false;
  private shouldReconnect = true;

  constructor(config: OpenClawConfig) {
    super();
    this.config = {
      gateway: config.gateway || 'ws://localhost:18789',
      token: config.token,
      clientId: config.clientId || `convoe-${Date.now()}`,
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
    };
  }

  /**
   * Connect to the OpenClaw gateway
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[OpenClawClient] Connecting to ${this.config.gateway}...`);

        this.ws = new WebSocket(this.config.gateway);

        this.ws.on('open', () => {
          console.log('[OpenClawClient] WebSocket connected');
          this.handleOpen().then(resolve).catch(reject);
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', (code, reason) => {
          console.log(`[OpenClawClient] WebSocket closed: ${code} ${reason}`);
          this.isConnected = false;
          this.emit('disconnected', { code, reason: reason.toString() });
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('[OpenClawClient] WebSocket error:', error);
          this.emit('error', error);
          if (!this.isConnected) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle WebSocket open - perform handshake
   */
  private async handleOpen(): Promise<void> {
    // Wait for challenge from server
    const challenge = await this.waitForChallenge();

    // Send connect request
    const connectRequest = {
      type: 'req',
      id: ++this.requestId,
      method: 'connect',
      params: {
        minProtocol: 1,
        maxProtocol: 1,
        client: {
          id: this.config.clientId,
          version: '1.0.0',
          platform: 'convoe-backend',
          mode: 'operator',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        auth: this.config.token,
        challenge: challenge,
      },
    };

    this.send(connectRequest);

    // Wait for hello-ok response
    const response = await this.waitForResponse(this.requestId);

    if (response.ok) {
      console.log('[OpenClawClient] Handshake successful');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    } else {
      throw new Error(`Handshake failed: ${response.error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Wait for server challenge
   */
  private waitForChallenge(): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Challenge timeout'));
      }, 10000);

      const handler = (data: string) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'challenge') {
            clearTimeout(timeout);
            this.ws?.off('message', handler);
            resolve(msg);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      this.ws?.on('message', handler);
    });
  }

  /**
   * Wait for a specific response
   */
  private waitForResponse(requestId: number, timeoutMs = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'res':
          // Response to a request
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(msg.id);
            pending.resolve(msg);
          }
          break;

        case 'event':
          // Event from server
          this.handleEvent(msg);
          break;

        case 'challenge':
          // Initial challenge (handled in waitForChallenge)
          break;

        default:
          console.log('[OpenClawClient] Unknown message type:', msg.type);
      }
    } catch (error) {
      console.error('[OpenClawClient] Error parsing message:', error);
    }
  }

  /**
   * Handle events from the gateway
   */
  private handleEvent(event: any): void {
    switch (event.event) {
      case 'message.received':
        // New message from a channel
        const message = this.parseIncomingMessage(event.payload);
        if (message) {
          this.emit('message', message);
        }
        break;

      case 'channel.status':
        this.emit('channelStatus', event.payload);
        break;

      case 'agent.status':
        this.emit('agentStatus', event.payload);
        break;

      default:
        this.emit('event', event);
    }
  }

  /**
   * Parse incoming message from gateway format
   */
  private parseIncomingMessage(payload: any): OpenClawMessage | null {
    try {
      return {
        id: payload.id || payload.messageId,
        channel: payload.channel || payload.platform,
        chatId: payload.chatId || payload.conversationId,
        userId: payload.userId || payload.senderId,
        userName: payload.userName || payload.senderName,
        text: payload.text || payload.content || '',
        attachments: payload.attachments?.map((a: any) => ({
          type: a.type,
          url: a.url,
          mimeType: a.mimeType,
          fileName: a.fileName,
          size: a.size,
        })),
        replyTo: payload.replyTo || payload.quotedMessageId,
        quotedText: payload.quotedText,
        timestamp: new Date(payload.timestamp || Date.now()),
        isGroup: payload.isGroup || false,
        groupName: payload.groupName,
      };
    } catch (error) {
      console.error('[OpenClawClient] Error parsing message:', error);
      return null;
    }
  }

  /**
   * Send a message through OpenClaw
   */
  async sendMessage(response: OpenClawResponse): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to OpenClaw gateway');
    }

    const request = {
      type: 'req',
      id: ++this.requestId,
      method: 'message.send',
      params: {
        channel: response.channel,
        chatId: response.chatId,
        text: response.text,
        attachments: response.attachments,
        replyTo: response.replyToMessageId,
      },
    };

    this.send(request);

    const result = await this.waitForResponse(this.requestId);

    if (!result.ok) {
      throw new Error(`Failed to send message: ${result.error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Get channel status
   */
  async getChannelStatus(channel?: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to OpenClaw gateway');
    }

    const request = {
      type: 'req',
      id: ++this.requestId,
      method: 'channels.status',
      params: { channel },
    };

    this.send(request);

    const result = await this.waitForResponse(this.requestId);

    if (!result.ok) {
      throw new Error(`Failed to get channel status: ${result.error?.message || 'Unknown error'}`);
    }

    return result.payload;
  }

  /**
   * Send raw WebSocket message
   */
  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (!this.shouldReconnect) return;

    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      console.error('[OpenClawClient] Max reconnect attempts reached');
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[OpenClawClient] Reconnecting in ${this.config.reconnectInterval}ms (attempt ${this.reconnectAttempts})...`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[OpenClawClient] Reconnect failed:', error);
      });
    }, this.config.reconnectInterval);
  }

  /**
   * Disconnect from the gateway
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let clientInstance: OpenClawClient | null = null;

/**
 * Get or create the OpenClaw client singleton
 */
export function getOpenClawClient(): OpenClawClient | null {
  if (!clientInstance) {
    const gateway = process.env.OPENCLAW_GATEWAY;
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;

    if (!gateway) {
      console.log('[OpenClawClient] OPENCLAW_GATEWAY not configured');
      return null;
    }

    clientInstance = new OpenClawClient({
      gateway,
      token,
    });
  }
  return clientInstance;
}

/**
 * Initialize and connect the OpenClaw client
 */
export async function initOpenClawClient(): Promise<OpenClawClient | null> {
  const client = getOpenClawClient();
  if (client && !client.connected) {
    try {
      await client.connect();
      return client;
    } catch (error) {
      console.error('[OpenClawClient] Failed to connect:', error);
      return null;
    }
  }
  return client;
}
