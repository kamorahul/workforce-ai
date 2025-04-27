import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createAgent, User } from './agents/createAgent';
import { apiKey, serverClient } from './serverClient';
import {auth} from 'express-oauth2-jwt-bearer'
import { connectDB } from './config/mongodb';
import { Attendance } from './models/Attendance';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

// Map to store the AI Agent instances
// [cid: string]: AI Agent
app.get('/', (req, res) => {
  res.json({
    message: 'GetStream AI Server is running',
    apiKey: apiKey,
  });
});

/*
 * Handle Join chat user
 * */
app.post('/join', async (req, res): Promise<void> => {
  const { username } = req.body;
  const token = serverClient.createToken(username);
  try {
    await serverClient.upsertUser({
      id: username,
    });

    // Ensure the user "Kai" exists
    await serverClient.upsertUser({ id: 'Kai', name: 'Kai' });

    // Create a new channel (if it doesn’t exist)
    const channel = serverClient.channel('messaging', `kai${username}`, {
      name: `Kai`,
      created_by_id: username,
    });

    await channel.create(); // Create channel
    await channel.hide(username);
    await channel.addMembers([username, 'Kai']); // Add both users
  } catch (err: any) {
    res.status(500).json({ err: err.message });
    return;
  }

  res.status(200).json({ user: { username }, token });
});

/*
 * Handle Join chat user
 * */
app.post('/channel-join', async (req, res): Promise<void> => {
  const { username, channelId } = req.body;
  try {
    // Create a new channel (if it doesn’t exist)
    const channel = serverClient.channel('messaging', channelId);
    await channel.addMembers([ username ]); // Add both users
  } catch (err: any) {
    res.status(500).json({ err: err.message });
    return;
  }

  res.status(200).json({ status: 'ok', message: 'Channel joined successfully' });
});

/*
 * Handle Join chat user
 * */
app.post('/getstream/webhooks', async (req, res): Promise<void> => {
  const { message, user } = req.body;

  console.log("Req Body: ", req.body);

  let summaryChannel;
  let {
    cid: channelId,
    args: channelName,
  } = message;

  const [channel] = await searchChannelsByName(channelName.split('@')[1]);
  if (channel && channel.id) {
    summaryChannel = channel.id;
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

  const agent = await createAgent(user as User, channelType, channelIdUpdated);


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
        text: 'Do you want to send this as a real message?',
            type: 'ephemeral',
            restricted_visibility: [user.id],
      }}
      res.json(req.body);
  }

  res.json(req.body);
});

app.post('/webhook', async (req, res): Promise<void> => {
  const {message, user, channel} = req.body
  console.log("Body:", req.body);

  const agent = await createAgent(user as User, channel.type, channel.id);

  if(user.id==='kai' || channel.id.indexOf('kai') !== 0) {
    res.json(req.body);
    return;

  }
  await agent.init("asst_Q8vD9YOGcO3es62kFjeVZI5L");
    agent.handleMessage(
        message.text
    );
});
//handle attendance
app.post('/attendance', async (req, res) => {
  try {
    const { userId, groupId, projectId, datetime, status } = req.body;
    console.log("Body:", req.body);
    
    if (!userId || !groupId || !projectId || !datetime || !status) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    if (status !== 'checkin' && status !== 'checkout') {
      res.status(400).json({ error: 'Invalid status. Must be either checkin or checkout' });
      return;
    }

    const attendance = new Attendance({
      userId,
      groupId,
      projectId,
      datetime: new Date(datetime),
      status
    });

    await attendance.save();

    res.status(201).json({
      message: `Attendance ${status} recorded successfully`,
      data: attendance
    });
  } catch (error) {
    console.error('Error recording attendance:', error);
    res.status(500).json({ error: 'Failed to record attendance' });
  }
});

app.get('/attendance', async (req, res) => {
  try {
    const { userId, groupId, projectId, startDateTime, endDateTime } = req.query;

    const query: any = {};
    if (userId) query.userId = userId;
    if (groupId) query.groupId = groupId;
    if (projectId) query.projectId = projectId;
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

// Start the Express server
const port = process.env.PORT || 3000;
app.listen(port, async () => {
  try {
    await connectDB();
    console.log(`Server is running on http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
});

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