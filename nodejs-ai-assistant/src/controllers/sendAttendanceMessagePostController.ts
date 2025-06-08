import express, { Request, Response, Router } from 'express';
import moment from 'moment-timezone';
import { serverClient } from '../serverClient';
import { Attendance } from '../models/Attendance';
import { ProjectDetails } from '../models/Project';
import { SentMessageLog } from '../models/SentMessageLog';
import { AttendanceLog } from '../models/AttendanceLog';
import { convertStreamToEmail } from '../utils/index';

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, projectId, projectName, action } = req.body;

    console.log('send-attendance-message Called: ', req.body);
    if (!userId || !projectId || !action || !projectName) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const user = await serverClient.queryUsers({ id: userId });
    const userName = user.users[0]?.name || convertStreamToEmail(userId);
    const channel = serverClient.channel('messaging', `tai_${userId}`);

    let projectTimezone = 'UTC';
    try {
      const project = await ProjectDetails.findById(projectId);
      if (project && project.timezone) {
        projectTimezone = project.timezone;
      } else {
        console.warn(`Project timezone not found for projectId: ${projectId}. Defaulting to UTC.`);
      }
    } catch (error) {
      console.warn(`Error fetching project details for projectId: ${projectId}. Defaulting to UTC. Error: ${error}`);
    }

    const todayStart = moment.tz(projectTimezone).startOf('day').toDate();
    const todayEnd = moment.tz(projectTimezone).endOf('day').toDate();
    const eventDateForLog = moment.tz(projectTimezone).startOf('day').toDate(); // For SentMessageLog

    if (action === 'checkin') {
      const todaysCheckins = await Attendance.find({
        userId,
        projectId,
        status: 'checkin',
        datetime: {
          $gte: todayStart,
          $lte: todayEnd,
        },
      });

      if (todaysCheckins.length === 0) {
        const existingPromptLog = await SentMessageLog.findOne({
          userId,
          projectId,
          messageType: 'first_enter_prompt',
          eventDate: eventDateForLog,
        });

        if (existingPromptLog) {
          res
              .status(200)
              .json({
                status: 'info',
                message:
                    'First enter prompt already sent today for this project.',
                action: 'checkin',
              });
          return;
        }

        try {
          await new SentMessageLog({
            userId,
            projectId,
            messageType: 'first_enter_prompt',
            eventDate: eventDateForLog,
          }).save();

          const response = await channel.sendMessage({
            user_id: 'tai',
            text: `Dear ${userName}, Please check in to the project to record your attendance. Your check-in time has not been registered yet.`,
            type: 'regular',
            action_type: 'attendance',
            projectId,
            checkInTime: moment.tz(projectTimezone).toDate(),
            projectName,
          }, {skip_push: false});

          res.status(201).json({
            status: 'success',
            message: 'Attendance message sent successfully',
            messageId: response.message.id,
            action: 'checkin',
          });
        } catch (sendError: any) {
          console.error('Error sending check-in message:', sendError);
          res.status(200).json({ // Original code sends 200 on send error
            error: 'Failed to send check-in message',
            details: sendError.message,
          });
        }
      } else {
        res.status(200).json({
          status: 'info',
          message: 'Already checked in today. No message sent.',
          action: 'checkin',
        });
      }
    } else if (action === 'checkout') {
      const existingPromptLog = await SentMessageLog.findOne({
        userId,
        projectId,
        messageType: 'last_exit_prompt',
        eventDate: eventDateForLog,
      });

      if (existingPromptLog) {
        res
            .status(200)
            .json({
              status: 'info',
              message: 'Exit prompt already sent today for this project.',
              action: 'checkout',
            });
        return;
      }

      try {
        await new SentMessageLog({
          userId,
          projectId,
          messageType: 'last_exit_prompt',
          eventDate: eventDateForLog,
        }).save();

        const response = await channel.sendMessage({
          show_in_channel: true,
          text: `Dear ${userName},\nPlease check out from the project to record your attendance. Your check-out time has not been registered yet.`,
          type: 'regular',
          action_type: 'attendance',
          projectId,
          projectName,
          user_id: 'tai',
          checkOutTime: moment.tz(projectTimezone).toDate(),
        });

        res.status(201).json({
          status: 'success',
          message: 'Attendance message sent successfully',
          messageId: response.message.id,
          action: 'checkout',
        });
      } catch (sendError: any) {
        console.error('Error sending check-out message:', sendError);
        res.status(200).json({ // Original code sends 200 on send error
          error: 'Failed to send check-out message',
          details: sendError.message,
        });
      }
    } else {
      res
          .status(400)
          .json({
            error: 'Invalid action specified. Must be "checkin" or "checkout".',
          });
      return; // Return after sending 400
    }

    // This AttendanceLog save was outside the if/else if for action,
    // so it runs for both 'checkin' and 'checkout' if they don't return early.
    // It also runs if a prompt was already sent or if already checked in for the day.
    // Replicating this behavior.
    try {
      const attendanceLog = new AttendanceLog({
        userId,
        projectId,
        timestamp: moment.tz(projectTimezone).toDate(), // Uses current time in project's timezone
        action: action === 'checkin' ? 'ENTER' : 'EXIT',
      });
      await attendanceLog.save();
    } catch (logError) {
      console.error('Error saving AttendanceLog:', logError);
      // Original code just logs and continues
    }

  } catch (error: any) {
    console.error('Error in send-attendance-message process:', error);
    if (!res.headersSent) { // Ensure response is sent only once
        res.status(500).json({
        error: 'Failed to process attendance message',
        details: error.message,
        });
    }
  }
});

export default router;
