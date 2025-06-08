import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient';
import { AttendanceLog } from '../models/AttendanceLog'; // Assuming correct path

const router: Router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'Missing or invalid userId' });
      return;
    }

    const channels = await serverClient.queryChannels({
      members: { $in: [userId as string] },
      type: 'messaging'
      // Consider adding a filter here if channels used for projects have a specific characteristic,
      // e.g., a custom field like `isProjectChannel: true` or similar,
      // to avoid processing unrelated channels.
    });

    const projectsPromises = channels.map(async (channel) => {
      // Ensure channel.data exists and then access its properties
      const location = channel.data?.location;
      const hasCoordinates = location &&
          typeof location === 'object' &&
          'type' in location && // Check for 'type' property
          (location as any).type === 'Point' && // Optional: Check if type is 'Point'
          'coordinates' in location &&
          Array.isArray((location as any).coordinates) &&
          (location as any).coordinates.length === 2 &&
          typeof (location as any).coordinates[0] === 'number' && // Ensure coordinates are numbers
          typeof (location as any).coordinates[1] === 'number';

      if (!hasCoordinates) {
        // console.log(`Channel ${channel.id} skipped due to missing or invalid location data.`);
        return null;
      }

      const lastLog = await AttendanceLog.findOne({
        projectId: channel.id, // Assuming channel.id is the projectId
        userId: userId as string,
      }).sort({ timestamp: -1 }).limit(1);

      return {
        projectId: channel.id,
        projectName: channel.data?.name || '',
        createdBy: channel.data?.created_by_id || '', // Safely access created_by_id
        projectDetails: channel.data?.projectDetails || {},
        qrCode: channel.data?.qrCode || '',
        location: (location as any).coordinates, // Already validated coordinates
        lastAttendanceFlow: lastLog ? { action: lastLog.action, timestamp: lastLog.timestamp } : null,
      };
    });

    const projects = (await Promise.all(projectsPromises)).filter(project => project !== null);

    res.status(200).json({
      status: 'success',
      data: projects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

export default router;
