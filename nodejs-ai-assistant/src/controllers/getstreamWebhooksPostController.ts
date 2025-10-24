import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient';
import { createAgent, User } from '../agents/createAgent';
import { Channel } from '../models/Channel';

const router: Router = express.Router();

async function searchChannelsByName(name: string) {
  const filters = {
    type: 'messaging',
    name: { $autocomplete: name }, // partial match
  };

  return await serverClient.queryChannels(
      filters,
      {},
      {
        limit: 1,
      },
  );
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { message, user } = req.body;

  console.log("Req Body: ", req.body);

  // --- Extract and save channel data ---
  try {
    const channelId = message?.cid;
    const channelType = message?.type || 'messaging';
    const channelName = message?.args || '';
    const createdBy = user?.id || '';
    const members = message?.members || (user ? [user.id] : []);
    const image = message?.image || '';

    if (channelId && channelType && channelName && createdBy) {
      await Channel.findOneAndUpdate(
        { channelId },
        {
          channelId,
          type: channelType,
          name: typeof channelName === 'string' ? channelName : '',
          createdBy,
          members,
          image,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  } catch (err) {
    console.error('Error saving channel data:', err);
  }
  // --- End channel data save ---

  let summaryChannel;
  let {
    cid: channelId,
    args: channelName,
  } = message;

  // Ensure channelName is a string and then split
  if (typeof channelName === 'string') {
    const nameParts = channelName.split('@');
    if (nameParts.length > 1) {
      const [channel] = await searchChannelsByName(nameParts[1]);
      if (channel && channel.id) {
        summaryChannel = channel.id;
      }
    }
  }

  // Simple validation
  if (!channelId) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  let channelType = 'messaging';
  let channelIdUpdated = channelId;
  if (channelId.includes(':')) {
    const parts = channelId.split(':');
    if (parts.length > 1) {
      channelIdUpdated = parts[1];
      channelType = parts[0];
    }
  }

  // For summary and calendar commands, create agent for user's kai channel
  // For other commands, use the current channel
  let agentChannel = channelIdUpdated;
  let agentChannelType = channelType;
  
  if (message.command === 'summary' || message.command === 'calender') {
    // Send response to user's kai channel instead of current channel
    agentChannel = `kai_${user.id}`;
    agentChannelType = 'messaging';
  }
  
  const agent = await createAgent(user as User, agentChannelType, agentChannel);

  switch (message.command) {
    case 'summary':
      await agent.init("asst_wD1s9GID1EVsh7BSLZNbkdJr");
      if (summaryChannel) {
        agent.handleMessage(
            `Generate today's Summary for ${user.name} for groupId ${summaryChannel} and channel name is ${channelName?.split('@')[1]}. `,
        );
      } else {
        agent.handleMessage(
            `Generate today's Summary for ${user.name} for groupId ${channelIdUpdated}. Don't mention groupId in the result.`,
        );
      }
      break;
    case 'calender':
      await agent.init("asst_iocLVsbx9oRarBKPdYbMACSY");
      if (summaryChannel) {
        console.log("Summary>>>>>>>>>>", summaryChannel)
        agent.handleMessage(
            `Generate all future events(meetings, group call, work scheduling, timings, team events, company events, occasions etc.) details based on recent conversations with all the channel members for ${user.id} .`,
        );
      } else {
        console.log("else>>>>>>>>>>", agent)
        agent.handleMessage(
            `Generate all future events(meetings, group call, work scheduling, timings, team events, company events, occasions etc.) details based on recent conversations with all the channel members for ${user.id} .`,
        );
      }
      break;
    case 'attendance':
      req.body.message = {...req.body.message, ...{
          text: 'Attendance',
          type: 'regular',
          action_type: 'attendance',
          restricted_visibility: [user.id],
        }}
      // For 'attendance', the original code just sends back the modified body.
      // It doesn't seem to use the agent for this command.
      // We will replicate this behavior.
      res.json(req.body);
      return; // Return early as we've handled the response for 'attendance'
  }

  // If the command is not 'attendance', and not handled by other cases,
  // the original code sends back the original request body.
  // This seems to be the default behavior if no specific command logic sends a response earlier.
  if (!res.headersSent) {
    res.json(req.body);
  }
});

export default router;
