/**
 * OpenClaw Configuration
 *
 * This file contains configuration for the OpenClaw integration.
 * Environment variables control which features are enabled.
 */

export interface OpenClawPlatformConfig {
  enabled: boolean;
  welcomeMessage?: string;
  botToken?: string;
}

export interface OpenClawConfiguration {
  // Core settings
  enabled: boolean;
  gateway: string;
  apiKey?: string;

  // Skills configuration
  skills: {
    create_task: boolean;
    create_event: boolean;
    get_tasks: boolean;
    get_events: boolean;
    send_email: boolean;
    sync_calendar: boolean;
  };

  // Platform configurations (for future WhatsApp/Telegram support)
  platforms: {
    whatsapp: OpenClawPlatformConfig;
    telegram: OpenClawPlatformConfig;
    slack: OpenClawPlatformConfig;
  };
}

/**
 * Get OpenClaw configuration from environment variables
 */
export function getOpenClawConfiguration(): OpenClawConfiguration {
  return {
    // Core settings
    enabled: process.env.OPENCLAW_ENABLED === 'true',
    gateway: process.env.OPENCLAW_GATEWAY || 'ws://localhost:18789',
    apiKey: process.env.OPENCLAW_API_KEY,

    // Skills - each can be enabled independently
    skills: {
      create_task: process.env.OPENCLAW_SKILL_CREATE_TASK === 'true',
      create_event: process.env.OPENCLAW_SKILL_CREATE_EVENT === 'true',
      get_tasks: process.env.OPENCLAW_SKILL_GET_TASKS === 'true',
      get_events: process.env.OPENCLAW_SKILL_GET_EVENTS === 'true',
      send_email: process.env.OPENCLAW_SKILL_SEND_EMAIL === 'true',
      sync_calendar: process.env.OPENCLAW_SKILL_SYNC_CALENDAR === 'true',
    },

    // Platform configurations (for future use)
    platforms: {
      whatsapp: {
        enabled: process.env.OPENCLAW_WHATSAPP_ENABLED === 'true',
        welcomeMessage:
          process.env.OPENCLAW_WHATSAPP_WELCOME ||
          "Hi! I'm Kai, your work assistant. How can I help?",
      },
      telegram: {
        enabled: process.env.OPENCLAW_TELEGRAM_ENABLED === 'true',
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        welcomeMessage:
          process.env.OPENCLAW_TELEGRAM_WELCOME ||
          "Hi! I'm Kai, your work assistant. How can I help?",
      },
      slack: {
        enabled: process.env.OPENCLAW_SLACK_ENABLED === 'true',
        welcomeMessage:
          process.env.OPENCLAW_SLACK_WELCOME ||
          "Hi! I'm Kai, your work assistant. How can I help?",
      },
    },
  };
}

/**
 * Check if any OpenClaw features are enabled
 */
export function isOpenClawEnabled(): boolean {
  const config = getOpenClawConfiguration();
  return config.enabled || Object.values(config.skills).some((enabled) => enabled);
}

/**
 * Get list of enabled skill names
 */
export function getEnabledSkills(): string[] {
  const config = getOpenClawConfiguration();
  return Object.entries(config.skills)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
}

/**
 * Get list of enabled platform names
 */
export function getEnabledPlatforms(): string[] {
  const config = getOpenClawConfiguration();
  return Object.entries(config.platforms)
    .filter(([_, platform]) => platform.enabled)
    .map(([name]) => name);
}
