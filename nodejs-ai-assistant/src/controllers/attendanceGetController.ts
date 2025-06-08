import express, { Request, Response, Router } from 'express';
import { Attendance } from '../models/Attendance'; // Assuming this is the correct path

const router: Router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId, groupId, projectId, startDateTime, endDateTime } = req.query;

    const query: any = {};
    if (userId) query.userId = userId as string;
    if (groupId) query.groupId = groupId as string;
    if (projectId) query.projectId = projectId as string;
    if (startDateTime && endDateTime) {
      query.datetime = {
        $gte: new Date(startDateTime as string),
        $lte: new Date(endDateTime as string)
      };
    }

    const records = await Attendance.find(query).sort({ datetime: -1 });
    res.json(records);
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

export default router;
