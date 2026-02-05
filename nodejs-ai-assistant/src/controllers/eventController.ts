import express, { Request, Response, Router } from 'express';
import { Event, IEvent } from '../models/Event';
import { getStreamUserId } from '../middleware/auth';
import { serverClient } from '../serverClient';
import { getStreamFeedsService } from '../utils/getstreamFeedsService';

// Helper function to check if user is a member of a channel
const isChannelMember = async (channelId: string, userId: string): Promise<boolean> => {
  try {
    if (!channelId || !userId) return false;

    const extractedChannelId = channelId.includes(':') ? channelId.split(':')[1] : channelId;
    const extractedUserId = userId.includes('|') ? userId.split('|')[1] : userId;

    const channel = serverClient.channel('messaging', extractedChannelId);

    let response = await channel.queryMembers({ user_id: extractedUserId });
    if (response.members.length === 0 && extractedUserId !== userId) {
      response = await channel.queryMembers({ user_id: userId });
    }

    return response.members.length > 0;
  } catch (error) {
    console.error('Error checking channel membership:', error);
    return false;
  }
};

const router: Router = express.Router();

// POST /event - Create a new event
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      startDate,
      endDate,
      allDay,
      location,
      attendees,
      organizer,
      channelId,
      messageId,
      reminder,
      recurrence,
      timezone
    } = req.body;

    // Validation
    if (!title || !startDate || !organizer) {
      res.status(400).json({ error: 'Missing required fields: title, startDate, and organizer are required' });
      return;
    }

    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      res.status(400).json({ error: 'Attendees must be a non-empty array' });
      return;
    }

    const event: IEvent = new Event({
      title,
      description,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      allDay: allDay || false,
      location,
      attendees,
      organizer,
      channelId,
      messageId,
      status: 'scheduled',
      reminder: reminder || 15,
      recurrence,
      // Store the creator's timezone for proper display across timezones
      timezone: timezone || 'UTC',
    });

    await event.save();

    console.log('📅 Event created:', event._id, 'Attendees:', attendees);

    res.status(201).json({
      status: 'success',
      event
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// GET /event - List events with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      attendee,
      organizer,
      channelId,
      status,
      startFrom,
      startTo,
      limit = '50',
      offset = '0'
    } = req.query;

    const query: any = {};
    const andConditions: any[] = [];

    // Filter by attendee or organizer
    if (attendee && organizer) {
      andConditions.push({
        $or: [
          { 'attendees.userId': { $in: [attendee as string] } },
          { organizer: organizer as string }
        ]
      });
    } else if (attendee) {
      query['attendees.userId'] = { $in: [attendee as string] };
    } else if (organizer) {
      query.organizer = organizer as string;
    }

    // Filter by channel
    if (channelId) {
      const channelIdStr = channelId as string;
      const extractedId = channelIdStr.includes(':') ? channelIdStr.split(':')[1] : channelIdStr;
      const fullCid = channelIdStr.includes(':') ? channelIdStr : `messaging:${channelIdStr}`;

      andConditions.push({
        $or: [
          { channelId: channelIdStr },
          { channelId: extractedId },
          { channelId: fullCid }
        ]
      });
    }

    // Filter by status
    if (status) {
      query.status = status as string;
    }

    // Filter by date range (for calendar view)
    if (startFrom || startTo) {
      const dateFilter: any = {};
      if (startFrom) {
        dateFilter.$gte = new Date(startFrom as string);
      }
      if (startTo) {
        dateFilter.$lte = new Date(startTo as string);
      }
      query.startDate = dateFilter;
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const totalCount = await Event.countDocuments(query);

    const events = await Event.find(query)
      .limit(limitNum)
      .skip(offsetNum)
      .sort({ startDate: 1 }) // Sort by start date ascending (upcoming first)
      .lean();

    const hasMore = offsetNum + limitNum < totalCount;

    res.status(200).json({
      status: 'success',
      events,
      total: totalCount,
      limit: limitNum,
      offset: offsetNum,
      hasMore
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /event/calendar - Calendar view (events for a date range)
router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const { userId, startDate, endDate } = req.query;

    if (!userId || !startDate || !endDate) {
      res.status(400).json({ error: 'Missing required parameters: userId, startDate, endDate' });
      return;
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    // Get events where user is attendee or organizer
    const events = await Event.find({
      $or: [
        { 'attendees.userId': { $in: [userId as string] } },
        { organizer: userId as string }
      ],
      $and: [
        {
          $or: [
            // Events that start within the range
            { startDate: { $gte: start, $lte: end } },
            // Events that span across the range (started before, ends after)
            { startDate: { $lte: start }, endDate: { $gte: start } },
            // All-day events on start date
            { startDate: { $lte: end }, allDay: true }
          ]
        }
      ],
      status: { $ne: 'cancelled' }
    })
    .sort({ startDate: 1 })
    .lean();

    res.status(200).json({
      status: 'success',
      events,
      dateRange: { startDate: start, endDate: end }
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// GET /event/upcoming - Get upcoming events for a user
router.get('/upcoming', async (req: Request, res: Response) => {
  try {
    const { userId, limit = '10' } = req.query;

    if (!userId) {
      res.status(400).json({ error: 'Missing required parameter: userId' });
      return;
    }

    const now = new Date();
    const limitNum = parseInt(limit as string, 10);

    const events = await Event.find({
      $or: [
        { 'attendees.userId': { $in: [userId as string] } },
        { organizer: userId as string }
      ],
      startDate: { $gte: now },
      status: 'scheduled'
    })
    .sort({ startDate: 1 })
    .limit(limitNum)
    .lean();

    res.status(200).json({
      status: 'success',
      events
    });
  } catch (error) {
    console.error('Error fetching upcoming events:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming events' });
  }
});

// GET /event/:eventId - Get event details
router.get('/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      res.status(400).json({ error: 'Missing required parameter: eventId' });
      return;
    }

    const event = await Event.findById(eventId);

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Permission check: user must be organizer, attendee, or channel member
    const userId = getStreamUserId(req);
    const isOrganizer = event.organizer === userId;
    const isAttendee = event.attendees?.includes(userId || '');
    const isMember = event.channelId ? await isChannelMember(event.channelId, userId || '') : false;

    if (!isOrganizer && !isAttendee && !isMember) {
      res.status(403).json({ error: 'You do not have access to this event' });
      return;
    }

    res.status(200).json({
      status: 'success',
      event
    });
  } catch (error) {
    console.error('Error fetching event details:', error);
    res.status(500).json({ error: 'Failed to fetch event details' });
  }
});

// PUT /event/:eventId - Update event
router.put('/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      res.status(400).json({ error: 'Missing required parameter: eventId' });
      return;
    }

    const event = await Event.findById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const {
      title,
      description,
      startDate,
      endDate,
      allDay,
      location,
      attendees,
      status,
      reminder,
      recurrence,
      timezone
    } = req.body;

    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (allDay !== undefined) updateData.allDay = allDay;
    if (location !== undefined) updateData.location = location;
    if (attendees !== undefined) {
      if (!Array.isArray(attendees) || attendees.length === 0) {
        res.status(400).json({ error: 'Attendees must be a non-empty array' });
        return;
      }
      updateData.attendees = attendees;
    }
    if (status !== undefined) updateData.status = status;
    if (reminder !== undefined) updateData.reminder = reminder;
    if (recurrence !== undefined) updateData.recurrence = recurrence;
    if (timezone !== undefined) updateData.timezone = timezone;

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedEvent) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    console.log('📅 Event updated:', updatedEvent._id);

    res.status(200).json({
      status: 'success',
      event: updatedEvent
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// PATCH /event/:eventId/rsvp - RSVP to event
router.patch('/:eventId/rsvp', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { userId, response: rsvpResponse, userName } = req.body;

    if (!eventId || !userId || !rsvpResponse) {
      res.status(400).json({ error: 'Missing required fields: eventId, userId, response' });
      return;
    }

    if (!['yes', 'no', 'maybe'].includes(rsvpResponse)) {
      res.status(400).json({ error: 'Invalid RSVP response. Must be: yes, no, or maybe' });
      return;
    }

    const event = await Event.findById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Find the attendee in the array
    const attendeeIndex = event.attendees.findIndex(a => a.userId === userId);
    if (attendeeIndex === -1) {
      res.status(403).json({ error: 'User is not an attendee of this event' });
      return;
    }

    // Update the attendee's RSVP status
    event.attendees[attendeeIndex].status = rsvpResponse as 'yes' | 'no' | 'maybe';
    event.attendees[attendeeIndex].respondedAt = new Date();

    await event.save();
    console.log(`📅 RSVP for event ${eventId}: User ${userId} responded ${rsvpResponse}`);

    // Notify the organizer about the RSVP response
    try {
      // Get the responder's display name from Stream (not the phone number)
      const responderDisplayName = await getStreamFeedsService.getUserName(userId);
      const responseText = rsvpResponse === 'yes' ? 'accepted' : rsvpResponse === 'no' ? 'declined' : 'responded maybe to';

      await getStreamFeedsService.createNotification(event.organizer, 'event_rsvp', eventId, {
        eventId: eventId,
        eventTitle: event.title,
        responderId: userId,
        responderName: responderDisplayName,
        response: rsvpResponse
      });
      console.log(`📬 Notified organizer ${event.organizer} about RSVP from ${responderDisplayName}`);
    } catch (notifError) {
      console.error('Failed to notify organizer:', notifError);
    }

    // Calculate RSVP counts
    const rsvpCounts = {
      yes: event.attendees.filter(a => a.status === 'yes').length,
      no: event.attendees.filter(a => a.status === 'no').length,
      maybe: event.attendees.filter(a => a.status === 'maybe').length,
      pending: event.attendees.filter(a => a.status === 'pending').length,
    };

    res.status(200).json({
      status: 'success',
      eventId,
      userId,
      rsvpResponse,
      rsvpCounts,
      message: 'RSVP recorded successfully'
    });
  } catch (error) {
    console.error('Error recording RSVP:', error);
    res.status(500).json({ error: 'Failed to record RSVP' });
  }
});

// PATCH /event/:eventId/cancel - Cancel event
router.patch('/:eventId/cancel', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      res.status(400).json({ error: 'Missing required parameter: eventId' });
      return;
    }

    const event = await Event.findByIdAndUpdate(
      eventId,
      { status: 'cancelled' },
      { new: true }
    );

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    console.log('📅 Event cancelled:', eventId);

    res.status(200).json({
      status: 'success',
      event
    });
  } catch (error) {
    console.error('Error cancelling event:', error);
    res.status(500).json({ error: 'Failed to cancel event' });
  }
});

// DELETE /event/:eventId - Delete event
router.delete('/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      res.status(400).json({ error: 'Missing required parameter: eventId' });
      return;
    }

    const event = await Event.findById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    await Event.findByIdAndDelete(eventId);

    console.log('📅 Event deleted:', eventId);

    res.status(200).json({
      status: 'success',
      message: 'Event deleted successfully',
      deletedEventId: eventId
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// GET /event/count/upcoming - Count upcoming events for a user
router.get('/count/upcoming', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      res.status(400).json({ error: 'Missing required parameter: userId' });
      return;
    }

    const now = new Date();

    const count = await Event.countDocuments({
      $or: [
        { 'attendees.userId': { $in: [userId as string] } },
        { organizer: userId as string }
      ],
      startDate: { $gte: now },
      status: 'scheduled'
    });

    res.status(200).json({
      status: 'success',
      count
    });
  } catch (error) {
    console.error('Error counting upcoming events:', error);
    res.status(500).json({ error: 'Failed to count upcoming events' });
  }
});

export default router;
