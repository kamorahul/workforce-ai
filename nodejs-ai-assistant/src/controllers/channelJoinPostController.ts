import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient';
import { ProjectDetails } from '../models/Project'; // Assuming this is the correct path
import { convertEmailToStreamFormat, getTimezoneFromCoordinates } from '../utils/index'; // Assuming this is the correct path

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { isNewChannel, projectData, username, channelId } = req.body;

  try {
    if (isNewChannel && projectData) {
      const { email, projectName, projectDetails } = projectData;
      const newChannelId = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${convertEmailToStreamFormat(email)}`;
      const channelData = {
        name: projectName,
        image: 'https://cdn-icons-png.flaticon.com/512/1077/1077012.png',
        created_by_id: convertEmailToStreamFormat(email),
        members: [convertEmailToStreamFormat(email)],
        projectId: projectData.projectId,
        qrCode: projectData.qrCode,
        location: projectData.location,
        projectDetails: {
          description: projectDetails?.description || '',
          location: projectDetails?.location || '',
          startTime: projectDetails?.startTime || null,
          endTime: projectDetails?.endTime || null,
          timeSheetRequirement: projectDetails?.timeSheetRequirement || false,
          swms: projectDetails?.swms || ''
        }
      };

      const channel = serverClient.channel('messaging', newChannelId, channelData);
      await channel.create();

      // ---- Start: Save ProjectDetails to MongoDB ----
      try {
        const [longitude, latitude] = projectData.location.coordinates; // GeoJSON is [longitude, latitude]
        const timezone = getTimezoneFromCoordinates(latitude, longitude);

        const newProject = new ProjectDetails({
          projectId: projectData.projectId,
          projectName: projectData.projectName,
          email: projectData.email,
          location: projectData.location, // Assuming projectData.location is already in correct GeoJSON Point format
          description: projectData.projectDetails?.description,
          startTime: projectData.projectDetails?.startTime ? new Date(projectData.projectDetails.startTime) : undefined,
          endTime: projectData.projectDetails?.endTime ? new Date(projectData.projectDetails.endTime) : undefined,
          timeSheetRequirement: projectData.projectDetails?.timeSheetRequirement,
          swms: projectData.projectDetails?.swms,
          qrCode: projectData.qrCode,
          timezone: timezone,
          channelId: newChannelId,
        });

        await newProject.save();
        console.log(`ProjectDetails saved successfully for projectId: ${projectData.projectId}, channelId: ${newChannelId}`);

      } catch (dbError: any) {
        console.error(`Error saving ProjectDetails for projectId: ${projectData.projectId}, channelId: ${newChannelId}:`, dbError);
        // Decide if you want to let the channel creation fail or just log the error
        // For now, just logging, channel creation response is sent below
      }
      // ---- End: Save ProjectDetails to MongoDB ----

      res.status(200).json({
        status: 'success',
        message: 'Channel created successfully',
        channelId: newChannelId
      });
    } else {
      // Handle joining existing channel
      if (!username || !channelId) {
        res.status(400).json({
          error: 'Missing required fields',
          details: 'username and channelId are required for joining a channel'
        });
        return;
      }

      const channel = serverClient.channel('messaging', channelId);
      await channel.addMembers([username]);

      res.status(200).json({
        status: 'success',
        message: 'Channel joined successfully'
      });
    }
  } catch (err: any) {
    console.error('Channel operation error:', err);
    res.status(500).json({
      error: 'Operation failed',
      details: err.message
    });
    return;
  }
});

export default router;
