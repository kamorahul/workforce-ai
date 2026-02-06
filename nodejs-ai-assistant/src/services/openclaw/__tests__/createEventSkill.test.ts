/**
 * Create Event Skill Tests
 */

// Mock dependencies BEFORE importing modules that use them
jest.mock('../../../models/Event');
jest.mock('../../../utils/getstreamFeedsService', () => ({
  getStreamFeedsService: {
    createTaskActivity: jest.fn().mockResolvedValue(undefined),
    createEventActivity: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../../serverClient', () => ({
  serverClient: {},
  apiKey: 'test_key',
  apiSecret: 'test_secret',
}));

import { createEventHandler, CreateEventArgs } from '../skills/createEventSkill';
import { SkillContext } from '../types';
import { Event } from '../../../models/Event';
import { getStreamFeedsService } from '../../../utils/getstreamFeedsService';

describe('createEventSkill', () => {
  const mockContext: SkillContext = {
    userId: 'user123',
    channelId: 'channel456',
    timezone: 'America/New_York',
    mentionedUsers: [
      { id: 'sarah_id', name: 'Sarah' },
      { id: 'mike_id', name: 'Mike' },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Event constructor and save
    (Event as any).mockImplementation((data: any) => ({
      ...data,
      _id: 'event_123',
      save: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn().mockReturnValue({ ...data, _id: 'event_123' }),
    }));

    // Mock notification service
    (getStreamFeedsService.createEventActivity as jest.Mock).mockResolvedValue(undefined);
  });

  describe('createEventHandler', () => {
    it('should create a basic event with required fields', async () => {
      const args: CreateEventArgs = {
        title: 'Team Standup',
        startDate: '2026-02-10T14:00:00Z',
      };

      const result = await createEventHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.title).toBe('Team Standup');
      expect(result.data?.timezone).toBe('America/New_York');
    });

    it('should create an event with all fields', async () => {
      const args: CreateEventArgs = {
        title: 'Project Review Meeting',
        description: 'Q1 roadmap discussion',
        startDate: '2026-02-10T14:00:00Z',
        endDate: '2026-02-10T15:00:00Z',
        location: 'Zoom',
        attendees: ['Sarah', 'Mike'],
        reminder: 30,
      };

      const result = await createEventHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Project Review Meeting');
      expect(result.data?.location).toBe('Zoom');
    });

    it('should resolve mentioned user names to IDs for attendees', async () => {
      const args: CreateEventArgs = {
        title: 'Meeting with Sarah',
        startDate: '2026-02-10T14:00:00Z',
        attendees: ['Sarah'],
      };

      const result = await createEventHandler(args, mockContext);

      expect(result.success).toBe(true);
      // Sarah should be resolved from mentioned users
      expect(Event).toHaveBeenCalledWith(
        expect.objectContaining({
          attendees: [{ userId: 'sarah_id', status: 'pending' }],
        })
      );
    });

    it('should handle multiple attendees', async () => {
      const args: CreateEventArgs = {
        title: 'Team meeting',
        startDate: '2026-02-10T14:00:00Z',
        attendees: ['Sarah', 'Mike'],
      };

      const result = await createEventHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(Event).toHaveBeenCalledWith(
        expect.objectContaining({
          attendees: [
            { userId: 'sarah_id', status: 'pending' },
            { userId: 'mike_id', status: 'pending' },
          ],
        })
      );
    });

    it('should default to current user when no attendees specified', async () => {
      const args: CreateEventArgs = {
        title: 'My personal event',
        startDate: '2026-02-10T14:00:00Z',
      };

      const result = await createEventHandler(args, mockContext);

      expect(result.success).toBe(true);
      expect(Event).toHaveBeenCalledWith(
        expect.objectContaining({
          attendees: [{ userId: 'user123', status: 'pending' }],
        })
      );
    });

    it('should set organizer to current user', async () => {
      const args: CreateEventArgs = {
        title: 'Event I am organizing',
        startDate: '2026-02-10T14:00:00Z',
      };

      await createEventHandler(args, mockContext);

      expect(Event).toHaveBeenCalledWith(
        expect.objectContaining({
          organizer: 'user123',
        })
      );
    });

    it('should use default reminder of 15 minutes', async () => {
      const args: CreateEventArgs = {
        title: 'Event without reminder specified',
        startDate: '2026-02-10T14:00:00Z',
      };

      await createEventHandler(args, mockContext);

      expect(Event).toHaveBeenCalledWith(
        expect.objectContaining({
          reminder: 15,
        })
      );
    });

    it('should use custom reminder when specified', async () => {
      const args: CreateEventArgs = {
        title: 'Event with 30 min reminder',
        startDate: '2026-02-10T14:00:00Z',
        reminder: 30,
      };

      await createEventHandler(args, mockContext);

      expect(Event).toHaveBeenCalledWith(
        expect.objectContaining({
          reminder: 30,
        })
      );
    });

    it('should use UTC timezone when not provided in context', async () => {
      const contextWithoutTimezone: SkillContext = {
        userId: 'user123',
        channelId: 'channel456',
      };

      const args: CreateEventArgs = {
        title: 'Event without timezone',
        startDate: '2026-02-10T14:00:00Z',
      };

      const result = await createEventHandler(args, contextWithoutTimezone);

      expect(result.success).toBe(true);
      expect(Event).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: 'UTC',
        })
      );
    });

    it('should parse startDate correctly', async () => {
      const args: CreateEventArgs = {
        title: 'Event with specific time',
        startDate: '2026-02-10T14:30:00Z',
      };

      await createEventHandler(args, mockContext);

      const eventCall = (Event as any).mock.calls[0][0];
      expect(eventCall.startDate).toEqual(new Date('2026-02-10T14:30:00Z'));
    });

    it('should handle optional endDate', async () => {
      const args: CreateEventArgs = {
        title: 'Event with end time',
        startDate: '2026-02-10T14:00:00Z',
        endDate: '2026-02-10T15:00:00Z',
      };

      await createEventHandler(args, mockContext);

      const eventCall = (Event as any).mock.calls[0][0];
      expect(eventCall.endDate).toEqual(new Date('2026-02-10T15:00:00Z'));
    });

    it('should set endDate to null when not provided', async () => {
      const args: CreateEventArgs = {
        title: 'Event without end time',
        startDate: '2026-02-10T14:00:00Z',
      };

      await createEventHandler(args, mockContext);

      const eventCall = (Event as any).mock.calls[0][0];
      expect(eventCall.endDate).toBeNull();
    });

    it('should send notifications after event creation', async () => {
      const args: CreateEventArgs = {
        title: 'Event with notifications',
        startDate: '2026-02-10T14:00:00Z',
      };

      await createEventHandler(args, mockContext);

      expect(getStreamFeedsService.createEventActivity).toHaveBeenCalled();
    });

    it('should succeed even if notifications fail', async () => {
      (getStreamFeedsService.createEventActivity as jest.Mock).mockRejectedValue(
        new Error('Notification failed')
      );

      const args: CreateEventArgs = {
        title: 'Event with failed notifications',
        startDate: '2026-02-10T14:00:00Z',
      };

      const result = await createEventHandler(args, mockContext);

      expect(result.success).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      (Event as any).mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('Database error')),
        toObject: jest.fn(),
      }));

      const args: CreateEventArgs = {
        title: 'Event that will fail',
        startDate: '2026-02-10T14:00:00Z',
      };

      const result = await createEventHandler(args, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should set status to scheduled', async () => {
      const args: CreateEventArgs = {
        title: 'Scheduled event',
        startDate: '2026-02-10T14:00:00Z',
      };

      await createEventHandler(args, mockContext);

      expect(Event).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'scheduled',
        })
      );
    });
  });
});
