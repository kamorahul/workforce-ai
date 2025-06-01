import mongoose from 'mongoose';
import cron from 'node-cron';
import { Attendance } from '../models/Attendance';
import { AttendanceLog } from '../models/AttendanceLog';
import { UserSettings } from '../models/UserSettings'; // Adjust path if necessary
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'; // For timezone calculations
// import { connectDB } from '../config/mongodb'; // If using shared connection logic

// Placeholder for DB connection if run standalone
// const connect = async () => {
//   if (mongoose.connection.readyState === 0) {
//     // await connectDB(); // Assuming connectDB is your existing connection function
//     // For now, direct connection for standalone possibility:
//     // await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/yourdbname');
//   }
// };

export const processDailyAutoCheckins = async (processingDate: Date) => {
  // await connect(); // Connect if needed, assuming handled by caller for now
  console.log(`Starting auto check-in processing for ${processingDate.toDateString()}`);

  // Broad phase: Get all ENTER logs for the processing day (using server's local time for boundaries)
  const processingDayBoundaryStart = new Date(processingDate);
  processingDayBoundaryStart.setHours(0, 0, 0, 0);

  const processingDayBoundaryEnd = new Date(processingDate);
  processingDayBoundaryEnd.setHours(23, 59, 59, 999);

  try {
    const distinctUserProjects = await AttendanceLog.aggregate([
      { $match: { timestamp: { $gte: processingDayBoundaryStart, $lte: processingDayBoundaryEnd }, action: 'ENTER' } },
      { $group: { _id: { userId: '$userId', projectId: '$projectId' } } },
      { $project: { userId: '$_id.userId', projectId: '$_id.projectId', _id: 0 } },
    ]);

    if (distinctUserProjects.length === 0) {
      console.log(`No 'ENTER' logs found for ${processingDate.toDateString()}. No auto check-ins to process.`);
      return;
    }

    console.log(`Found ${distinctUserProjects.length} distinct user/project pairs with 'ENTER' logs.`);

    for (const userProject of distinctUserProjects) {
      const { userId, projectId } = userProject;

      try {
        // --- Start of user-specific timezone logic ---
        let userTimezone = 'UTC'; // Default timezone
        try {
          const userSettings = await UserSettings.findOne({ userId: userId });
          if (userSettings && userSettings.timezone) {
            userTimezone = userSettings.timezone;
          }
        } catch (settingsError) {
          console.error(`Error fetching user settings for ${userId}, defaulting to UTC:`, settingsError);
        }

        // Define the start and end of the processingDate in the user's timezone
        const zonedProcessingDate = utcToZonedTime(processingDate, userTimezone);

        let dayStartUserTz = new Date(zonedProcessingDate);
        dayStartUserTz.setHours(0, 0, 0, 0); // Midnight in user's timezone for that day
        const dayStart = zonedTimeToUtc(dayStartUserTz, userTimezone); // Convert to UTC

        let dayEndUserTz = new Date(zonedProcessingDate);
        dayEndUserTz.setHours(23, 59, 59, 999); // End of day in user's timezone
        const dayEnd = zonedTimeToUtc(dayEndUserTz, userTimezone); // Convert to UTC

        console.log(`Processing CHECK-IN for userId: ${userId}, projectId: ${projectId} using timezone: ${userTimezone}. User-specific day boundaries (UTC): ${dayStart.toISOString()} - ${dayEnd.toISOString()}`);
        // --- End of user-specific timezone logic ---

        const earliestEnterLog = await AttendanceLog.findOne({
          userId,
          projectId,
          action: 'ENTER',
          timestamp: { $gte: dayStart, $lte: dayEnd }, // Uses user-specific dayStart/dayEnd
        }).sort({ timestamp: 1 });

        if (!earliestEnterLog) {
          // This should ideally not happen if distinctUserProjects was populated correctly
          console.warn(`No earliest 'ENTER' log found for userId: ${userId}, projectId: ${projectId} on ${processingDate.toDateString()} despite being in aggregate. Skipping.`);
          continue;
        }

        const firstEnterTime = earliestEnterLog.timestamp;
        const windowStart = new Date(firstEnterTime.getTime() - 15 * 60 * 1000);
        const windowEnd = new Date(firstEnterTime.getTime() + 15 * 60 * 1000);

        const existingAttendance = await Attendance.findOne({
          userId,
          projectId,
          status: 'checkin',
          datetime: { $gte: windowStart, $lte: windowEnd },
        });

        if (!existingAttendance) {
          const newAttendance = new Attendance({
            userId,
            projectId,
            datetime: firstEnterTime,
            status: 'checkin',
          });
          await newAttendance.save();
          console.log(`AUTO CHECK-IN: Created for userId: ${userId}, projectId: ${projectId} at ${firstEnterTime.toISOString()}`);
        } else {
          console.log(`INFO: Check-in already covered for userId: ${userId}, projectId: ${projectId} around ${firstEnterTime.toISOString()} (existing at ${existingAttendance.datetime.toISOString()}).`);
        }
      } catch (error) {
        console.error(`Error processing userProject (userId: ${userId}, projectId: ${projectId}):`, error);
        // Continue to the next userProject if one fails
      }
    }
    console.log(`Finished auto check-in processing for ${processingDate.toDateString()}`);
  } catch (error) {
    console.error(`FATAL: Error in processDailyAutoCheckins for ${processingDate.toDateString()}:`, error);
  }
};

export const processDailyAutoCheckouts = async (processingDate: Date) => {
  // await connect(); // Connect if needed, assuming handled by caller for now
  console.log(`Starting auto check-out processing for ${processingDate.toDateString()}`);

  // Broad phase: Get all ENTER logs for the processing day (using server's local time for boundaries)
  const processingDayBoundaryStart = new Date(processingDate);
  processingDayBoundaryStart.setHours(0, 0, 0, 0);

  const processingDayBoundaryEnd = new Date(processingDate);
  processingDayBoundaryEnd.setHours(23, 59, 59, 999);

  try {
    // Using the same distinctUserProjects logic as check-ins, assuming if they never 'ENTER'ed, no auto-checkout needed.
    const distinctUserProjects = await AttendanceLog.aggregate([
      { $match: { timestamp: { $gte: processingDayBoundaryStart, $lte: processingDayBoundaryEnd }, action: 'ENTER' } },
      { $group: { _id: { userId: '$userId', projectId: '$projectId' } } },
      { $project: { userId: '$_id.userId', projectId: '$_id.projectId', _id: 0 } },
    ]);

    if (distinctUserProjects.length === 0) {
      console.log(`No 'ENTER' logs found for ${processingDate.toDateString()}. No users to consider for auto check-outs.`);
      return;
    }

    console.log(`Found ${distinctUserProjects.length} distinct user/project pairs based on 'ENTER' logs to consider for auto check-outs.`);

    for (const userProject of distinctUserProjects) {
      const { userId, projectId } = userProject;

      try {
        // --- Start of user-specific timezone logic ---
        let userTimezone = 'UTC'; // Default timezone
        try {
          const userSettings = await UserSettings.findOne({ userId: userId });
          if (userSettings && userSettings.timezone) {
            userTimezone = userSettings.timezone;
          }
        } catch (settingsError) {
          console.error(`Error fetching user settings for ${userId}, defaulting to UTC:`, settingsError);
        }

        // Define the start and end of the processingDate in the user's timezone
        const zonedProcessingDate = utcToZonedTime(processingDate, userTimezone);

        let dayStartUserTz = new Date(zonedProcessingDate);
        dayStartUserTz.setHours(0, 0, 0, 0); // Midnight in user's timezone for that day
        const dayStart = zonedTimeToUtc(dayStartUserTz, userTimezone); // Convert to UTC

        let dayEndUserTz = new Date(zonedProcessingDate);
        dayEndUserTz.setHours(23, 59, 59, 999); // End of day in user's timezone
        const dayEnd = zonedTimeToUtc(dayEndUserTz, userTimezone); // Convert to UTC

        console.log(`Processing CHECK-OUT for userId: ${userId}, projectId: ${projectId} using timezone: ${userTimezone}. User-specific day boundaries (UTC): ${dayStart.toISOString()} - ${dayEnd.toISOString()}`);
        // --- End of user-specific timezone logic ---

        // Find their last check-in for the day (user-specific timezone)
        const lastCheckinRecord = await Attendance.findOne({
          userId,
          projectId,
          status: 'checkin',
          datetime: { $gte: dayStart, $lte: dayEnd }, // Uses user-specific dayStart/dayEnd
        }).sort({ datetime: -1 });

        if (!lastCheckinRecord) {
          console.log(`INFO: No check-in record found for userId: ${userId}, projectId: ${projectId} on ${processingDate.toDateString()}. Skipping auto-checkout.`);
          continue;
        }

        // Find the latest 'EXIT' log after their last check-in
        const lastExitLog = await AttendanceLog.findOne({
          userId,
          projectId,
          action: 'EXIT',
          timestamp: { $gte: lastCheckinRecord.datetime, $lte: dayEnd },
        }).sort({ timestamp: -1 });

        if (!lastExitLog) {
          console.log(`INFO: No 'EXIT' log found after last check-in for userId: ${userId}, projectId: ${projectId} (check-in at ${lastCheckinRecord.datetime.toISOString()}). Skipping auto-checkout.`);
          continue;
        }

        const lastExitTime = lastExitLog.timestamp;
        const windowStart = new Date(lastExitTime.getTime() - 15 * 60 * 1000);
        const windowEnd = new Date(lastExitTime.getTime() + 15 * 60 * 1000);

        // Check for existing checkout within the window and after the last check-in
        const existingCheckout = await Attendance.findOne({
          userId,
          projectId,
          status: 'checkout',
          datetime: { 
            $gte: windowStart, 
            $lte: windowEnd,
            $gt: lastCheckinRecord.datetime // Ensure checkout is after check-in
          },
        });

        if (!existingCheckout) {
          const newAttendance = new Attendance({
            userId,
            projectId,
            datetime: lastExitTime,
            status: 'checkout',
          });
          await newAttendance.save();
          console.log(`AUTO CHECK-OUT: Created for userId: ${userId}, projectId: ${projectId} at ${lastExitTime.toISOString()} (based on last check-in at ${lastCheckinRecord.datetime.toISOString()})`);
        } else {
          console.log(`INFO: Check-out already covered for userId: ${userId}, projectId: ${projectId} around ${lastExitTime.toISOString()} (existing at ${existingCheckout.datetime.toISOString()}).`);
        }
      } catch (error) {
        console.error(`Error processing userProject for auto-checkout (userId: ${userId}, projectId: ${projectId}):`, error);
        // Continue to the next userProject if one fails
      }
    }
    console.log(`Finished auto check-out processing for ${processingDate.toDateString()}`);
  } catch (error) {
    console.error(`FATAL: Error in processDailyAutoCheckouts for ${processingDate.toDateString()}:`, error);
  }
};

export const setupAutoAttendanceCronJob = () => {
  // Schedule to run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('CRON: Running daily auto attendance processing job...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    try {
      console.log(`CRON: Processing auto check-ins for ${yesterday.toDateString()}`);
      await processDailyAutoCheckins(yesterday);
      console.log(`CRON: Finished auto check-ins for ${yesterday.toDateString()}`);

      console.log(`CRON: Processing auto check-outs for ${yesterday.toDateString()}`);
      await processDailyAutoCheckouts(yesterday);
      console.log(`CRON: Finished auto check-outs for ${yesterday.toDateString()}`);

      console.log('CRON: Daily auto attendance processing job completed successfully.');
    } catch (error) {
      console.error('CRON: Error during daily auto attendance processing job:', error);
    }
  });

  console.log('Auto attendance cron job scheduled to run daily at 2:00 AM.');
};

// Example of how it might be initiated if run as a standalone script
// (async () => {
//   await connect();
//   setupAutoAttendanceCronJob();
//   // Or, for testing specific functions:
//   // await processDailyAutoCheckins(new Date());
//   // await processDailyAutoCheckouts(new Date());
// })();
