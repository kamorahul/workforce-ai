import cron from 'node-cron';
import { Event } from '../models/Event';
import { User } from '../models/User';
import { getStreamFeedsService } from '../utils/getstreamFeedsService';

/**
 * Event Reminder Cron Service
 *
 * Runs every minute to check for events that need reminder notifications.
 * Finds events where:
 * - reminder is set (reminder > 0)
 * - reminderSent is false
 * - startDate - reminder minutes <= now
 * - status is 'scheduled' (not cancelled or completed)
 */

// Track if cron is already started
let isRunning = false;

/**
 * Process event reminders
 */
async function processEventReminders(): Promise<void> {
  try {
    const now = new Date();

    // Find events that need reminders:
    // - Has reminder set
    // - Reminder not yet sent
    // - Event is scheduled (not cancelled/completed)
    // - Current time >= (startDate - reminder minutes)
    const eventsNeedingReminders = await Event.find({
      reminder: { $exists: true, $gt: 0 },
      reminderSent: { $ne: true },
      status: 'scheduled',
      startDate: { $gt: now } // Event hasn't started yet
    });

    for (const event of eventsNeedingReminders) {
      const reminderMinutes = event.reminder || 15;
      const reminderTime = new Date(event.startDate.getTime() - (reminderMinutes * 60 * 1000));

      // Check if it's time to send the reminder
      if (now >= reminderTime) {
        console.log(`⏰ Processing reminder for event: "${event.title}" (${event._id})`);

        // Get all users to notify (organizer + attendees)
        const attendeeIds = event.attendees.map(a => a.userId);
        const allUserIds = [...new Set([event.organizer, ...attendeeIds])];

        // Send reminder to each user
        for (const userId of allUserIds) {
          try {
            // Get user's timezone for personalized notification
            const user = await User.findOne({ userId });
            const userTimezone = user?.timezone || 'UTC';

            // Format event time in user's timezone
            const eventTimeFormatted = formatEventTimeForUser(event.startDate, userTimezone);

            await getStreamFeedsService.createNotification(userId, 'event_reminder', event._id.toString(), {
              eventId: event._id.toString(),
              eventTitle: event.title,
              startDate: event.startDate.toISOString(),
              location: event.location,
              minutesUntil: reminderMinutes,
              userTimezone,
              eventTimeFormatted
            });

            console.log(`  ✅ Sent reminder to ${userId} (${userTimezone})`);
          } catch (err) {
            console.error(`  ❌ Failed to send reminder to ${userId}:`, err);
          }
        }

        // Mark reminder as sent
        await Event.findByIdAndUpdate(event._id, { reminderSent: true });
        console.log(`  📌 Marked reminderSent=true for event ${event._id}`);
      }
    }
  } catch (error) {
    console.error('❌ Error processing event reminders:', error);
  }
}

/**
 * Format event time for a specific user's timezone
 */
function formatEventTimeForUser(eventDate: Date, timezone: string): string {
  try {
    return eventDate.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    // Fallback to UTC if timezone is invalid
    return eventDate.toLocaleString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' UTC';
  }
}

/**
 * Start the event reminder cron job
 * Runs every minute
 */
export function startEventReminderCron(): void {
  if (isRunning) {
    console.log('⚠️ Event reminder cron is already running');
    return;
  }

  // Run every minute: '* * * * *'
  cron.schedule('* * * * *', async () => {
    await processEventReminders();
  });

  isRunning = true;
  console.log('🕐 Event reminder cron started (runs every minute)');

  // Run once immediately on startup to catch any missed reminders
  processEventReminders();
}

/**
 * Manually trigger reminder processing (for testing)
 */
export async function triggerReminderProcessing(): Promise<void> {
  console.log('🔄 Manually triggering reminder processing...');
  await processEventReminders();
}

export default { startEventReminderCron, triggerReminderProcessing };
