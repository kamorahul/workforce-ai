import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient';

const router: Router = express.Router();

/**
 * POST /channel-member-role
 * Update member role in a channel (make admin or remove admin)
 *
 * Body:
 * - channelId: string - The channel ID
 * - userId: string - The user ID to update
 * - action: 'add_moderator' | 'remove_moderator' - The action to perform
 * - requesterId: string - The user making the request (must be channel owner)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { channelId, userId, action, requesterId } = req.body;

  // Validate required fields
  if (!channelId || !userId || !action || !requesterId) {
    res.status(400).json({
      error: 'Missing required fields',
      details: 'channelId, userId, action, and requesterId are required'
    });
    return;
  }

  // Validate action
  if (action !== 'add_moderator' && action !== 'remove_moderator') {
    res.status(400).json({
      error: 'Invalid action',
      details: 'action must be either "add_moderator" or "remove_moderator"'
    });
    return;
  }

  try {
    const channel = serverClient.channel('messaging', channelId);

    // Query channel to get channel data and verify ownership
    const channelData = await channel.query();

    // Check if requester is the channel owner
    const channelCreatorId = channelData.channel?.created_by_id ||
      (channelData.channel?.created_by as any)?.id;

    if (channelCreatorId !== requesterId) {
      res.status(403).json({
        error: 'Unauthorized',
        details: 'Only the channel owner can change member roles'
      });
      return;
    }

    // Check if the target user is a member of the channel
    const members = channelData.members || [];
    const targetMember = members.find((m: any) => m.user_id === userId || m.user?.id === userId);

    if (!targetMember) {
      res.status(404).json({
        error: 'User not found',
        details: 'The specified user is not a member of this channel'
      });
      return;
    }

    // Prevent changing role of the owner
    if (userId === channelCreatorId) {
      res.status(400).json({
        error: 'Invalid operation',
        details: 'Cannot change the role of the channel owner'
      });
      return;
    }

    // Perform the action
    if (action === 'add_moderator') {
      await channel.addModerators([userId]);
      res.status(200).json({
        status: 'success',
        message: 'User has been made an admin',
        userId,
        role: 'channel_moderator'
      });
    } else {
      await channel.demoteModerators([userId]);
      res.status(200).json({
        status: 'success',
        message: 'Admin role has been removed from user',
        userId,
        role: 'channel_member'
      });
    }
  } catch (err: any) {
    console.error('Channel member role update error:', err);
    res.status(500).json({
      error: 'Operation failed',
      details: err.message
    });
  }
});

export default router;
