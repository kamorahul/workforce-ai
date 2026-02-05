import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendee {
  userId: string;
  status: 'pending' | 'yes' | 'no' | 'maybe';
  respondedAt?: Date;
}

export interface IEvent extends Document {
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  allDay: boolean;
  location?: string;
  attendees: IAttendee[]; // Array of attendees with RSVP status
  organizer: string; // userId of the event creator
  channelId?: string;
  messageId?: string; // Reference to the original message
  status: 'scheduled' | 'cancelled' | 'completed';
  reminder?: number; // Minutes before event to remind
  reminderSent?: boolean; // Track if reminder notification was sent
  /**
   * Timezone where the event was created (IANA timezone identifier)
   * e.g., "Asia/Kolkata", "America/New_York", "Europe/London"
   * Used for displaying the original event time context to users in different timezones
   */
  timezone?: string;
  recurrence?: {
    type: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: Date;
  };
  attachments?: Array<{
    uri: string;
    name: string;
    type: string;
    size?: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema: Schema = new Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: false,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: false,
  },
  allDay: {
    type: Boolean,
    default: false,
  },
  location: {
    type: String,
    required: false,
  },
  attendees: {
    type: [{
      userId: { type: String, required: true },
      status: {
        type: String,
        enum: ['pending', 'yes', 'no', 'maybe'],
        default: 'pending'
      },
      respondedAt: { type: Date, required: false }
    }],
    required: true,
    default: [],
  },
  organizer: {
    type: String,
    required: true,
    index: true,
  },
  channelId: {
    type: String,
    required: false,
    index: true,
  },
  messageId: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    enum: ['scheduled', 'cancelled', 'completed'],
    default: 'scheduled',
    required: true,
  },
  reminder: {
    type: Number,
    required: false,
  },
  reminderSent: {
    type: Boolean,
    default: false,
  },
  timezone: {
    type: String,
    required: false,
    // IANA timezone identifier (e.g., "Asia/Kolkata", "America/New_York")
    // Defaults to UTC if not provided
    default: 'UTC',
  },
  recurrence: {
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
    },
    interval: Number,
    endDate: Date,
  },
  attachments: {
    type: [{
      uri: { type: String, required: true },
      name: { type: String, required: true },
      type: { type: String, required: true },
      size: { type: Number, required: false },
    }],
    required: false,
    default: [],
  }
}, {
  timestamps: true,
});

// Index for querying events by date range
EventSchema.index({ startDate: 1, endDate: 1 });
EventSchema.index({ 'attendees.userId': 1, startDate: 1 });
// Index for reminder cron job - finds events needing reminders efficiently
EventSchema.index({ reminder: 1, reminderSent: 1, status: 1, startDate: 1 });

export const Event = mongoose.model<IEvent>('Event', EventSchema);
