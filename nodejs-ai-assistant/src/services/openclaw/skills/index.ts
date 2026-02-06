/**
 * OpenClaw Skills Index
 * Exports all skill definitions and handlers
 */

export { createTaskSkill, createTaskHandler, type CreateTaskArgs } from './createTaskSkill';
export { createEventSkill, createEventHandler, type CreateEventArgs } from './createEventSkill';
export { getTasksSkill, getTasksHandler, type GetTasksArgs } from './getTasksSkill';
export { getEventsSkill, getEventsHandler, type GetEventsArgs } from './getEventsSkill';

import { SkillDefinition } from '../types';
import { createTaskSkill } from './createTaskSkill';
import { createEventSkill } from './createEventSkill';
import { getTasksSkill } from './getTasksSkill';
import { getEventsSkill } from './getEventsSkill';

/**
 * All available skills mapped by name
 */
export const allSkills: Record<string, SkillDefinition> = {
  create_task: createTaskSkill,
  create_event: createEventSkill,
  get_tasks: getTasksSkill,
  get_events: getEventsSkill,
};

/**
 * Get skill by name
 */
export function getSkill(name: string): SkillDefinition | undefined {
  return allSkills[name];
}

/**
 * Get all skill names
 */
export function getSkillNames(): string[] {
  return Object.keys(allSkills);
}
