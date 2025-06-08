import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient';

const router: Router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { messageId, projectId } = req.query;

    if (!messageId || !projectId) {
      res.status(400).json({ error: 'Missing required fields: messageId and projectId' });
      return;
    }

    let channelIdStr: string | undefined = undefined;

    if (typeof projectId === 'string') {
      channelIdStr = projectId;
    } else if (Array.isArray(projectId) && projectId.length > 0 && typeof projectId[0] === 'string') {
      channelIdStr = projectId[0];
    }

    if (!channelIdStr) {
      res.status(400).json({ error: 'Invalid projectId format' });
      return;
    }

    const channel = serverClient.channel('messaging', channelIdStr);
    await channel.watch(); // Ensure channel state is up-to-date

    // It's safer to query messages with a filter if the API supports it,
    // or ensure that `channel.state.messages` is not excessively large.
    // For now, replicating the existing find logic.
    const message = channel.state.messages.find(m => m.id === messageId);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Constructing a specific object with desired fields
    const messageDetails = {
      id: message.id,
      text: message.text,
      user_id: message.user?.id, // Access user id safely
      created_at: message.created_at,
      status: message.status, // This might be a GetStream specific status
      type: message.type,
      // action_type and restricted_visibility might not be standard on all message objects
      // Safely access them:
      action_type: (message as any).action_type,
      restricted_visibility: (message as any).restricted_visibility
    };

    res.status(200).json({
      status: 'success',
      message: 'Message details retrieved successfully',
      data: messageDetails
    });
  } catch (error) {
    console.error('Error checking message status:', error);
    res.status(500).json({ error: 'Failed to check message status' });
  }
});

export default router;
