/**
 * Create Event Skill
 * Wraps existing Event model functionality for OpenClaw integration
 */

import { Event } from '../../../models/Event';
import { getStreamFeedsService } from '../../../utils/getstreamFeedsService';
import { SkillDefinition, SkillContext, SkillResult, EventData } from '../types';

export interface CreateEventArgs {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  location?: string;
  attendees?: string[];
  reminder?: number;
}

/**
 * Get attendee IDs from mentioned users by matching names
 */
function getAttendeeIds(
  attendeeNames: string[] | undefined,
  context: SkillContext
): string[] {
  if (!attendeeNames || attendeeNames.length === 0) {
    return [context.userId];
  }

  if (context.mentionedUsers && context.mentionedUsers.length > 0) {
    const attendeeIds: string[] = [];

    for (const name of attendeeNames) {
      const matchedUser = context.mentionedUsers.find(
        (u) =>
          u.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(u.name.toLowerCase()) ||
          u.id.toLowerCase().includes(name.toLowerCase())
      );

      if (matchedUser) {
        attendeeIds.push(matchedUser.id);
        console.log(`[createEventSkill] Matched "${name}" to "${matchedUser.id}"`);
      }
    }

    return attendeeIds.length > 0 ? attendeeIds : [context.userId];
  }

  return [context.userId];
}

/**
 * Get attendee names for response
 */
function getAttendeeNames(
  attendeeIds: string[],
  context: SkillContext
): string[] {
  if (!context.mentionedUsers || context.mentionedUsers.length === 0) {
    return attendeeIds;
  }

  return attendeeIds.map((id) => {
    const user = context.mentionedUsers?.find((u) => u.id === id);
    return user?.name || id;
  });
}

/**
 * Create event handler - creates an event in the database
 */
export async function createEventHandler(
  args: CreateEventArgs,
  context: SkillContext
): Promise<SkillResult<EventData>> {
  try {
    console.log('[createEventSkill] Creating event:', args.title);
    console.log('[createEventSkill] Context:', {
      userId: context.userId,
      channelId: context.channelId,
      timezone: context.timezone,
    });

    const attendeeIds = getAttendeeIds(args.attendees, context);
    const attendeeNames = getAttendeeNames(attendeeIds, context);
    const timezone = context.timezone || 'UTC';

    // Convert attendeeIds to attendee objects with pending status
    const attendeesWithStatus = attendeeIds.map((userId) => ({
      userId,
      status: 'pending' as const,
    }));

    const event = new Event({
      title: args.title,
      description: args.description || '',
      startDate: new Date(args.startDate),
      endDate: args.endDate ? new Date(args.endDate) : null,
      location: args.location || '',
      attendees: attendeesWithStatus,
      organizer: context.userId,
      channelId: context.channelId,
      status: 'scheduled',
      reminder: args.reminder || 15,
      timezone: timezone,
    });

    await event.save();
    const eventId = (event._id as any).toString();
    console.log('[createEventSkill] Event created:', eventId);

    // Send notifications to attendees
    try {
      const eventPlain = event.toObject();
      await getStreamFeedsService.createEventActivity(eventId, eventPlain);
      console.log('[createEventSkill] Notifications sent');
    } catch (notifError) {
      console.error('[createEventSkill] Failed to send notifications:', notifError);
      // Don't fail event creation if notifications fail
    }

    return {
      success: true,
      data: {
        id: eventId,
        title: event.title,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate || undefined,
        location: event.location,
        attendees: attendeeNames,
        status: event.status,
        timezone: timezone,
      },
    };
  } catch (error) {
    console.error('[createEventSkill] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create event',
    };
  }
}

/**
 * Create Event Skill Definition
 */
export const createEventSkill: SkillDefinition = {
  name: 'create_event',
  description: 'Create a new calendar event or meeting. Use UTC format for dates.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Event title',
      },
      description: {
        type: 'string',
        description: 'Event agenda or details',
      },
      startDate: {
        type: 'string',
        description: 'Start date/time in UTC ISO format (must end with Z)',
      },
      endDate: {
        type: 'string',
        description: 'End date/time in UTC ISO format (must end with Z)',
      },
      location: {
        type: 'string',
        description: 'Location (Zoom, Office, etc.)',
      },
      attendees: {
        type: 'array',
        items: { type: 'string', description: 'Username to invite' },
        description: 'Usernames to invite to the event',
      },
      reminder: {
        type: 'number',
        description: 'Minutes before event to send reminder',
        default: 15,
      },
    },
    required: ['title', 'startDate'],
  },
  handler: createEventHandler,
};
