/**
 * Get Events Skill
 * Query events for the current user
 */

import { Event } from '../../../models/Event';
import { SkillDefinition, SkillContext, SkillResult, EventData } from '../types';

export interface GetEventsArgs {
  status?: 'scheduled' | 'cancelled' | 'completed' | 'all';
  startDate?: string;
  endDate?: string;
  limit?: number;
  upcoming?: boolean;
}

/**
 * Get events handler - queries events from the database
 */
export async function getEventsHandler(
  args: GetEventsArgs,
  context: SkillContext
): Promise<SkillResult<EventData[]>> {
  try {
    console.log('[getEventsSkill] Fetching events for user:', context.userId);
    console.log('[getEventsSkill] Args:', args);

    // Build query based on args
    const query: any = {
      $or: [
        { organizer: context.userId },
        { 'attendees.userId': context.userId },
      ],
    };

    // Filter by status
    if (args.status && args.status !== 'all') {
      query.status = args.status;
    }

    // Filter by date range
    if (args.upcoming) {
      query.startDate = { $gte: new Date() };
    } else {
      if (args.startDate) {
        query.startDate = { $gte: new Date(args.startDate) };
      }
      if (args.endDate) {
        query.startDate = query.startDate || {};
        query.startDate.$lte = new Date(args.endDate);
      }
    }

    const limit = args.limit || 50;

    const events = await Event.find(query)
      .select('title description startDate endDate location attendees organizer status reminder timezone')
      .sort({ startDate: 1 })
      .limit(limit)
      .lean();

    console.log(`[getEventsSkill] Found ${events.length} events`);

    const eventData: EventData[] = events.map((event: any) => ({
      id: event._id.toString(),
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      attendees: event.attendees?.map((a: any) => a.userId) || [],
      status: event.status,
      timezone: event.timezone,
    }));

    return {
      success: true,
      data: eventData,
    };
  } catch (error) {
    console.error('[getEventsSkill] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch events',
    };
  }
}

/**
 * Get Events Skill Definition
 */
export const getEventsSkill: SkillDefinition = {
  name: 'get_events',
  description: 'Get calendar events for the current user. Can filter by status and date range.',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['scheduled', 'cancelled', 'completed', 'all'],
        description: 'Filter events by status. Use "all" for all statuses.',
        default: 'all',
      },
      startDate: {
        type: 'string',
        description: 'Filter events starting from this date (ISO format)',
      },
      endDate: {
        type: 'string',
        description: 'Filter events ending before this date (ISO format)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of events to return',
        default: 50,
      },
      upcoming: {
        type: 'boolean',
        description: 'Only return upcoming events (from now onwards)',
        default: false,
      },
    },
    required: [],
  },
  handler: getEventsHandler,
};
