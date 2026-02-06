/**
 * Get Events Skill Tests
 */

import { getEventsHandler, GetEventsArgs } from '../skills/getEventsSkill';
import { SkillContext } from '../types';
import { Event } from '../../../models/Event';

// Mock dependencies
jest.mock('../../../models/Event');

describe('getEventsSkill', () => {
  const mockContext: SkillContext = {
    userId: 'user123',
    channelId: 'channel456',
    timezone: 'America/New_York',
  };

  const mockEvents = [
    {
      _id: 'event_1',
      title: 'Team Standup',
      description: 'Daily standup meeting',
      startDate: new Date('2026-02-10T14:00:00Z'),
      endDate: new Date('2026-02-10T14:30:00Z'),
      location: 'Zoom',
      attendees: [{ userId: 'user123', status: 'yes' }],
      organizer: 'user456',
      status: 'scheduled',
      timezone: 'America/New_York',
    },
    {
      _id: 'event_2',
      title: 'Project Review',
      description: 'Q1 review',
      startDate: new Date('2026-02-15T10:00:00Z'),
      endDate: new Date('2026-02-15T11:00:00Z'),
      location: 'Office',
      attendees: [
        { userId: 'user123', status: 'pending' },
        { userId: 'user789', status: 'yes' },
      ],
      organizer: 'user123',
      status: 'scheduled',
      timezone: 'UTC',
    },
    {
      _id: 'event_3',
      title: 'Cancelled Meeting',
      startDate: new Date('2026-02-20T09:00:00Z'),
      attendees: [{ userId: 'user123', status: 'pending' }],
      organizer: 'user123',
      status: 'cancelled',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Event.find chain
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockEvents),
    };
    (Event.find as jest.Mock).mockReturnValue(mockQuery);
  });

  describe('getEventsHandler', () => {
    it('should fetch all events for user by default', async () => {
      const args: GetEventsArgs = {};

      const result = await getEventsHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(Event.find).toHaveBeenCalledWith({
        $or: [
          { organizer: 'user123' },
          { 'attendees.userId': 'user123' },
        ],
      });
    });

    it('should filter by status when specified', async () => {
      const args: GetEventsArgs = { status: 'scheduled' };

      await getEventsHandler(args, mockContext);

      expect(Event.find).toHaveBeenCalledWith({
        $or: expect.any(Array),
        status: 'scheduled',
      });
    });

    it('should return all statuses when status is "all"', async () => {
      const args: GetEventsArgs = { status: 'all' };

      await getEventsHandler(args, mockContext);

      const findCall = (Event.find as jest.Mock).mock.calls[0][0];
      expect(findCall.status).toBeUndefined();
    });

    it('should filter upcoming events when specified', async () => {
      const args: GetEventsArgs = { upcoming: true };

      await getEventsHandler(args, mockContext);

      const findCall = (Event.find as jest.Mock).mock.calls[0][0];
      expect(findCall.startDate).toBeDefined();
      expect(findCall.startDate.$gte).toBeInstanceOf(Date);
    });

    it('should filter by startDate range', async () => {
      const args: GetEventsArgs = {
        startDate: '2026-02-10T00:00:00Z',
        endDate: '2026-02-20T00:00:00Z',
      };

      await getEventsHandler(args, mockContext);

      const findCall = (Event.find as jest.Mock).mock.calls[0][0];
      expect(findCall.startDate.$gte).toEqual(new Date('2026-02-10T00:00:00Z'));
      expect(findCall.startDate.$lte).toEqual(new Date('2026-02-20T00:00:00Z'));
    });

    it('should respect limit parameter', async () => {
      const args: GetEventsArgs = { limit: 10 };

      await getEventsHandler(args, mockContext);

      const mockQuery = (Event.find as jest.Mock).mock.results[0].value;
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should use default limit of 50', async () => {
      const args: GetEventsArgs = {};

      await getEventsHandler(args, mockContext);

      const mockQuery = (Event.find as jest.Mock).mock.results[0].value;
      expect(mockQuery.limit).toHaveBeenCalledWith(50);
    });

    it('should sort by startDate ascending', async () => {
      const args: GetEventsArgs = {};

      await getEventsHandler(args, mockContext);

      const mockQuery = (Event.find as jest.Mock).mock.results[0].value;
      expect(mockQuery.sort).toHaveBeenCalledWith({ startDate: 1 });
    });

    it('should transform events to EventData format', async () => {
      const args: GetEventsArgs = {};

      const result = await getEventsHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.[0]).toEqual({
        id: 'event_1',
        title: 'Team Standup',
        description: 'Daily standup meeting',
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        location: 'Zoom',
        attendees: ['user123'],
        status: 'scheduled',
        timezone: 'America/New_York',
      });
    });

    it('should extract userIds from attendees array', async () => {
      const args: GetEventsArgs = {};

      const result = await getEventsHandler(args, mockContext);

      // Event 2 has multiple attendees
      const event2 = result.data?.find((e) => e.id === 'event_2');
      expect(event2?.attendees).toEqual(['user123', 'user789']);
    });

    it('should handle events without attendees', async () => {
      const eventsWithoutAttendees = [
        {
          _id: 'event_no_attendees',
          title: 'Solo Event',
          startDate: new Date('2026-02-10T14:00:00Z'),
          organizer: 'user123',
          status: 'scheduled',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(eventsWithoutAttendees),
      };
      (Event.find as jest.Mock).mockReturnValue(mockQuery);

      const result = await getEventsHandler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.[0].attendees).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      (Event.find as jest.Mock).mockReturnValue(mockQuery);

      const result = await getEventsHandler({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should return empty array when no events found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
      (Event.find as jest.Mock).mockReturnValue(mockQuery);

      const result = await getEventsHandler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle optional endDate', async () => {
      const eventsWithoutEndDate = [
        {
          _id: 'event_no_end',
          title: 'Event without end',
          startDate: new Date('2026-02-10T14:00:00Z'),
          attendees: [{ userId: 'user123' }],
          organizer: 'user123',
          status: 'scheduled',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(eventsWithoutEndDate),
      };
      (Event.find as jest.Mock).mockReturnValue(mockQuery);

      const result = await getEventsHandler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.[0].endDate).toBeUndefined();
    });

    it('should include cancelled events when status is "cancelled"', async () => {
      const args: GetEventsArgs = { status: 'cancelled' };

      await getEventsHandler(args, mockContext);

      expect(Event.find).toHaveBeenCalledWith({
        $or: expect.any(Array),
        status: 'cancelled',
      });
    });
  });
});
