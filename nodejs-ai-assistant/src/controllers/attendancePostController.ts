import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient';
import { Attendance } from '../models/Attendance';
import { AttendanceLog } from '../models/AttendanceLog';

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, projectId, datetime, status, messageId, projectName } = req.body;
    console.log("Body:", req.body);

    if (!userId || !projectId || !status) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    if (status === 'cancel') {
      try {
        await serverClient.deleteMessage(messageId, true);
        res.status(201).json({
          message: {
            text: 'Attendance canceled successfully',
            type: 'regular',
            restricted_visibility: [userId]
          }
        });
        return;
      } catch (deleteError: any) {
        console.error("Error deleting message:", deleteError);
        if (deleteError.message && deleteError.message.includes('not found')) {
          res.status(404).json({
            error: 'Message not found',
            message: {
              text: 'Attendance message not found',
              type: 'regular',
              restricted_visibility: [userId]
            }
          });
        } else {
          res.status(500).json({
            error: 'Failed to delete attendance message',
            details: deleteError.message
          });
        }
        return;
      }
    }

    if (status !== 'checkin' && status !== 'checkout') {
      res.status(400).json({ error: 'Invalid status. Must be either checkin or checkout' });
      return;
    }

    const attendance = new Attendance({
      userId,
      projectId,
      datetime: new Date(datetime),
      status
    });

    await attendance.save();

    try {
      const attendanceLog = new AttendanceLog({
        userId: attendance.userId,
        projectId: attendance.projectId,
        timestamp: attendance.datetime,
        action: attendance.status === 'checkin' ? 'ENTER' : 'EXIT',
      });
      await attendanceLog.save();
    } catch (logError) {
      console.error('Error saving AttendanceLog:', logError);
      // For now, we just log the error and don't let it affect the main response
    }

    // It seems the original code attempts to delete the message regardless of whether saving AttendanceLog succeeded.
    // Replicating that behavior.
    await serverClient.deleteMessage(messageId, true);

    await serverClient.channel("messaging", `tai_${userId}`).sendMessage({
      user_id: userId,
      id: messageId, // This reuses the ID of the deleted message. This might be intentional or an oversight.
      text: `${status === 'checkin' ? 'Checkin': 'Checkout' } Done for project ${projectName} at ${new Date(datetime).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}`,
      type: 'regular',
    });

    res.status(201).json({
      status: 'success',
    });
  } catch (error) {
    console.error('Error recording attendance:', error);
    // Catching potential errors from deleteMessage or sendMessage if not caught by their own try/catch blocks.
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to record attendance' });
    }
  }
});

export default router;
