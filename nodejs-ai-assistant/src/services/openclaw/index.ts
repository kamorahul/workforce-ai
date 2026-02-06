/**
 * OpenClaw Integration
 *
 * This module provides OpenClaw integration for the Convoe backend.
 * It allows gradual migration of skills while keeping OpenAI/Claude as primary agents.
 *
 * Usage:
 * ```typescript
 * import { getOpenClawService } from './services/openclaw';
 *
 * const openclaw = getOpenClawService();
 *
 * // Check if enabled
 * if (openclaw.isEnabled()) {
 *   // Execute a skill
 *   const result = await openclaw.executeSkill('create_task', {
 *     title: 'Review docs',
 *     priority: 'high'
 *   }, {
 *     userId: 'user123',
 *     channelId: 'channel456',
 *     timezone: 'America/New_York'
 *   });
 * }
 * ```
 *
 * Configuration (environment variables):
 * - OPENCLAW_ENABLED=true - Enable OpenClaw integration
 * - OPENCLAW_GATEWAY=ws://localhost:18789 - OpenClaw gateway URL
 * - OPENCLAW_GATEWAY_TOKEN=your_token - OpenClaw gateway auth token
 * - OPENCLAW_SKILL_CREATE_TASK=true - Enable create_task skill
 * - OPENCLAW_SKILL_CREATE_EVENT=true - Enable create_event skill
 * - OPENCLAW_SKILL_GET_TASKS=true - Enable get_tasks skill
 * - OPENCLAW_SKILL_GET_EVENTS=true - Enable get_events skill
 * - OPENCLAW_SKILL_SEND_EMAIL=true - Enable send_email skill (future)
 * - OPENCLAW_SKILL_SYNC_CALENDAR=true - Enable sync_calendar skill (future)
 */

export {
  OpenClawService,
  getOpenClawService,
  getOpenClawConfig,
  resetOpenClawService,
} from './OpenClawService';

export {
  OpenClawClient,
  getOpenClawClient,
  initOpenClawClient,
} from './OpenClawClient';

export * from './types';
export * from './skills';
