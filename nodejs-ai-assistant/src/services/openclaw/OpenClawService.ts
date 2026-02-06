/**
 * OpenClaw Service
 * Central service for managing OpenClaw skills and integration
 *
 * This service provides a gradual migration path - skills can be enabled/disabled
 * individually while keeping existing OpenAI/Claude agents as primary.
 */

import { SkillDefinition, SkillContext, SkillResult, OpenClawConfig } from './types';
import { allSkills, getSkill } from './skills';

/**
 * Default configuration - all skills disabled by default for gradual rollout
 */
const defaultConfig: OpenClawConfig = {
  enabled: false,
  skills: {
    create_task: false,
    create_event: false,
    get_tasks: false,
    get_events: false,
    send_email: false,
    sync_calendar: false,
  },
};

/**
 * Get OpenClaw configuration from environment variables
 */
export function getOpenClawConfig(): OpenClawConfig {
  const config: OpenClawConfig = {
    enabled: process.env.OPENCLAW_ENABLED === 'true',
    gateway: process.env.OPENCLAW_GATEWAY || 'ws://localhost:18789',
    apiKey: process.env.OPENCLAW_API_KEY,
    skills: {
      create_task: process.env.OPENCLAW_SKILL_CREATE_TASK === 'true',
      create_event: process.env.OPENCLAW_SKILL_CREATE_EVENT === 'true',
      get_tasks: process.env.OPENCLAW_SKILL_GET_TASKS === 'true',
      get_events: process.env.OPENCLAW_SKILL_GET_EVENTS === 'true',
      send_email: process.env.OPENCLAW_SKILL_SEND_EMAIL === 'true',
      sync_calendar: process.env.OPENCLAW_SKILL_SYNC_CALENDAR === 'true',
    },
  };

  return config;
}

export class OpenClawService {
  private config: OpenClawConfig;
  private enabledSkills: Map<string, SkillDefinition>;

  constructor(config?: Partial<OpenClawConfig>) {
    this.config = { ...defaultConfig, ...config };
    this.enabledSkills = new Map();
    this.initializeSkills();
  }

  /**
   * Initialize enabled skills based on configuration
   */
  private initializeSkills(): void {
    // Register skills that are enabled in config
    if (this.config.skills.create_task) {
      const skill = getSkill('create_task');
      if (skill) {
        this.enabledSkills.set(skill.name, skill);
        console.log('[OpenClawService] Enabled skill: create_task');
      }
    }

    if (this.config.skills.create_event) {
      const skill = getSkill('create_event');
      if (skill) {
        this.enabledSkills.set(skill.name, skill);
        console.log('[OpenClawService] Enabled skill: create_event');
      }
    }

    if (this.config.skills.get_tasks) {
      const skill = getSkill('get_tasks');
      if (skill) {
        this.enabledSkills.set(skill.name, skill);
        console.log('[OpenClawService] Enabled skill: get_tasks');
      }
    }

    if (this.config.skills.get_events) {
      const skill = getSkill('get_events');
      if (skill) {
        this.enabledSkills.set(skill.name, skill);
        console.log('[OpenClawService] Enabled skill: get_events');
      }
    }

    console.log(`[OpenClawService] Initialized with ${this.enabledSkills.size} skills`);
  }

  /**
   * Check if OpenClaw integration is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if a specific skill is enabled
   */
  isSkillEnabled(skillName: string): boolean {
    return this.enabledSkills.has(skillName);
  }

  /**
   * Get all enabled skill names
   */
  getEnabledSkillNames(): string[] {
    return Array.from(this.enabledSkills.keys());
  }

  /**
   * Get enabled skill definitions for AI tool registration
   */
  getEnabledSkillDefinitions(): SkillDefinition[] {
    return Array.from(this.enabledSkills.values());
  }

  /**
   * Execute a skill by name
   */
  async executeSkill(
    skillName: string,
    args: any,
    context: SkillContext
  ): Promise<SkillResult> {
    const skill = this.enabledSkills.get(skillName);

    if (!skill) {
      console.warn(`[OpenClawService] Skill not found or not enabled: ${skillName}`);
      return {
        success: false,
        error: `Skill not found or not enabled: ${skillName}`,
      };
    }

    console.log(`[OpenClawService] Executing skill: ${skillName}`);
    return await skill.handler(args, context);
  }

  /**
   * Get skill definitions in Claude/Anthropic format
   */
  getClaudeToolDefinitions(): any[] {
    return this.getEnabledSkillDefinitions().map((skill) => ({
      name: skill.name,
      description: skill.description,
      input_schema: {
        type: 'object',
        properties: skill.parameters.properties,
        required: skill.parameters.required,
      },
    }));
  }

  /**
   * Get skill definitions in OpenAI format
   */
  getOpenAIToolDefinitions(): any[] {
    return this.getEnabledSkillDefinitions().map((skill) => ({
      type: 'function',
      function: {
        name: skill.name,
        description: skill.description,
        parameters: skill.parameters,
      },
    }));
  }

  /**
   * Enable a skill at runtime
   */
  enableSkill(skillName: string): boolean {
    const skill = getSkill(skillName);
    if (skill) {
      this.enabledSkills.set(skillName, skill);
      console.log(`[OpenClawService] Enabled skill: ${skillName}`);
      return true;
    }
    return false;
  }

  /**
   * Disable a skill at runtime
   */
  disableSkill(skillName: string): boolean {
    if (this.enabledSkills.has(skillName)) {
      this.enabledSkills.delete(skillName);
      console.log(`[OpenClawService] Disabled skill: ${skillName}`);
      return true;
    }
    return false;
  }
}

// Singleton instance with environment configuration
let serviceInstance: OpenClawService | null = null;

/**
 * Get the OpenClaw service singleton instance
 */
export function getOpenClawService(): OpenClawService {
  if (!serviceInstance) {
    const config = getOpenClawConfig();
    serviceInstance = new OpenClawService(config);
  }
  return serviceInstance;
}

/**
 * Reset the service instance (useful for testing)
 */
export function resetOpenClawService(): void {
  serviceInstance = null;
}
