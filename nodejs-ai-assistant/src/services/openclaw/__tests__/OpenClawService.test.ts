/**
 * OpenClaw Service Tests
 */

import {
  OpenClawService,
  getOpenClawService,
  getOpenClawConfig,
  resetOpenClawService,
} from '../OpenClawService';
import { SkillContext } from '../types';

// Mock skills
jest.mock('../skills/createTaskSkill', () => ({
  createTaskSkill: {
    name: 'create_task',
    description: 'Create a task',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: jest.fn().mockResolvedValue({ success: true, data: { id: 'task_123' } }),
  },
}));

jest.mock('../skills/createEventSkill', () => ({
  createEventSkill: {
    name: 'create_event',
    description: 'Create an event',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: jest.fn().mockResolvedValue({ success: true, data: { id: 'event_123' } }),
  },
}));

jest.mock('../skills/getTasksSkill', () => ({
  getTasksSkill: {
    name: 'get_tasks',
    description: 'Get tasks',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: jest.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

jest.mock('../skills/getEventsSkill', () => ({
  getEventsSkill: {
    name: 'get_events',
    description: 'Get events',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: jest.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

describe('OpenClawService', () => {
  const mockContext: SkillContext = {
    userId: 'user123',
    channelId: 'channel456',
    timezone: 'America/New_York',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenClawService();
  });

  describe('constructor', () => {
    it('should create service with default config (all disabled)', () => {
      const service = new OpenClawService();

      expect(service.isEnabled()).toBe(false);
      expect(service.getEnabledSkillNames()).toHaveLength(0);
    });

    it('should enable skills based on config', () => {
      const service = new OpenClawService({
        enabled: true,
        skills: {
          create_task: true,
          create_event: true,
          get_tasks: false,
          get_events: false,
          send_email: false,
          sync_calendar: false,
        },
      });

      expect(service.isEnabled()).toBe(true);
      expect(service.getEnabledSkillNames()).toContain('create_task');
      expect(service.getEnabledSkillNames()).toContain('create_event');
      expect(service.getEnabledSkillNames()).not.toContain('get_tasks');
    });

    it('should enable all configured skills', () => {
      const service = new OpenClawService({
        enabled: true,
        skills: {
          create_task: true,
          create_event: true,
          get_tasks: true,
          get_events: true,
          send_email: false,
          sync_calendar: false,
        },
      });

      expect(service.getEnabledSkillNames()).toHaveLength(4);
    });
  });

  describe('isEnabled', () => {
    it('should return false when not enabled', () => {
      const service = new OpenClawService({ enabled: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      const service = new OpenClawService({ enabled: true });
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('isSkillEnabled', () => {
    it('should return true for enabled skills', () => {
      const service = new OpenClawService({
        skills: {
          create_task: true,
          create_event: false,
          get_tasks: false,
          get_events: false,
          send_email: false,
          sync_calendar: false,
        },
      });

      expect(service.isSkillEnabled('create_task')).toBe(true);
      expect(service.isSkillEnabled('create_event')).toBe(false);
    });

    it('should return false for non-existent skills', () => {
      const service = new OpenClawService();
      expect(service.isSkillEnabled('non_existent')).toBe(false);
    });
  });

  describe('executeSkill', () => {
    it('should execute enabled skill successfully', async () => {
      const service = new OpenClawService({
        skills: {
          create_task: true,
          create_event: false,
          get_tasks: false,
          get_events: false,
          send_email: false,
          sync_calendar: false,
        },
      });

      const result = await service.executeSkill(
        'create_task',
        { title: 'Test task' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should return error for disabled skill', async () => {
      const service = new OpenClawService({
        skills: {
          create_task: false,
          create_event: false,
          get_tasks: false,
          get_events: false,
          send_email: false,
          sync_calendar: false,
        },
      });

      const result = await service.executeSkill(
        'create_task',
        { title: 'Test task' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found or not enabled');
    });

    it('should return error for non-existent skill', async () => {
      const service = new OpenClawService();

      const result = await service.executeSkill(
        'non_existent_skill',
        {},
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found or not enabled');
    });
  });

  describe('enableSkill/disableSkill', () => {
    it('should enable skill at runtime', () => {
      const service = new OpenClawService();

      expect(service.isSkillEnabled('create_task')).toBe(false);

      const enabled = service.enableSkill('create_task');

      expect(enabled).toBe(true);
      expect(service.isSkillEnabled('create_task')).toBe(true);
    });

    it('should disable skill at runtime', () => {
      const service = new OpenClawService({
        skills: {
          create_task: true,
          create_event: false,
          get_tasks: false,
          get_events: false,
          send_email: false,
          sync_calendar: false,
        },
      });

      expect(service.isSkillEnabled('create_task')).toBe(true);

      const disabled = service.disableSkill('create_task');

      expect(disabled).toBe(true);
      expect(service.isSkillEnabled('create_task')).toBe(false);
    });

    it('should return false when enabling non-existent skill', () => {
      const service = new OpenClawService();

      const enabled = service.enableSkill('non_existent');

      expect(enabled).toBe(false);
    });

    it('should return false when disabling non-existent skill', () => {
      const service = new OpenClawService();

      const disabled = service.disableSkill('non_existent');

      expect(disabled).toBe(false);
    });
  });

  describe('getClaudeToolDefinitions', () => {
    it('should return Claude-formatted tool definitions', () => {
      const service = new OpenClawService({
        skills: {
          create_task: true,
          create_event: false,
          get_tasks: false,
          get_events: false,
          send_email: false,
          sync_calendar: false,
        },
      });

      const tools = service.getClaudeToolDefinitions();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        name: 'create_task',
        description: 'Create a task',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      });
    });

    it('should return empty array when no skills enabled', () => {
      const service = new OpenClawService();

      const tools = service.getClaudeToolDefinitions();

      expect(tools).toEqual([]);
    });
  });

  describe('getOpenAIToolDefinitions', () => {
    it('should return OpenAI-formatted tool definitions', () => {
      const service = new OpenClawService({
        skills: {
          create_task: true,
          create_event: false,
          get_tasks: false,
          get_events: false,
          send_email: false,
          sync_calendar: false,
        },
      });

      const tools = service.getOpenAIToolDefinitions();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'create_task',
          description: 'Create a task',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      });
    });
  });

  describe('getOpenClawConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should read config from environment variables', () => {
      process.env.OPENCLAW_ENABLED = 'true';
      process.env.OPENCLAW_GATEWAY = 'ws://custom:8888';
      process.env.OPENCLAW_API_KEY = 'test_key';
      process.env.OPENCLAW_SKILL_CREATE_TASK = 'true';
      process.env.OPENCLAW_SKILL_CREATE_EVENT = 'true';

      const config = getOpenClawConfig();

      expect(config.enabled).toBe(true);
      expect(config.gateway).toBe('ws://custom:8888');
      expect(config.apiKey).toBe('test_key');
      expect(config.skills.create_task).toBe(true);
      expect(config.skills.create_event).toBe(true);
      expect(config.skills.get_tasks).toBe(false);
    });

    it('should use defaults when env vars not set', () => {
      delete process.env.OPENCLAW_ENABLED;
      delete process.env.OPENCLAW_GATEWAY;

      const config = getOpenClawConfig();

      expect(config.enabled).toBe(false);
      expect(config.gateway).toBe('ws://localhost:18789');
    });
  });

  describe('getOpenClawService (singleton)', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getOpenClawService();
      const service2 = getOpenClawService();

      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getOpenClawService();
      resetOpenClawService();
      const service2 = getOpenClawService();

      expect(service1).not.toBe(service2);
    });
  });
});
