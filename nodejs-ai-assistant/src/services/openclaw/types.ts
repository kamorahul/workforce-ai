/**
 * OpenClaw Integration Types
 * Defines interfaces for skills, contexts, and configuration
 */

export interface SkillContext {
  userId: string;
  channelId?: string;
  timezone?: string;
  mentionedUsers?: MentionedUser[];
}

export interface MentionedUser {
  id: string;
  name: string;
}

export interface SkillResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, SkillParameter>;
    required: string[];
  };
  handler: (args: any, context: SkillContext) => Promise<SkillResult>;
}

export interface SkillParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string; description?: string };
  default?: any;
}

export interface OpenClawConfig {
  enabled: boolean;
  gateway?: string;
  apiKey?: string;
  skills: {
    create_task: boolean;
    create_event: boolean;
    get_tasks: boolean;
    get_events: boolean;
    send_email: boolean;
    sync_calendar: boolean;
  };
}

export interface TaskData {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  assignees: string[];
  status: 'todo' | 'in_progress' | 'completed';
  timezone?: string;
}

export interface EventData {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  location?: string;
  attendees: string[];
  status: 'scheduled' | 'cancelled' | 'completed';
  timezone?: string;
}
