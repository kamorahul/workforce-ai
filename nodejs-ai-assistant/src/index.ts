import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createAgent, User } from './agents/createAgent';
import { apiKey, serverClient } from './serverClient';
import {auth} from 'express-oauth2-jwt-bearer'
import { connectDB } from './config/mongodb';
import { Attendance } from './models/Attendance';
import { convertEmailToStreamFormat, convertStreamToEmail } from './utils/index';

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

    // Create a new channel (if it doesn't exist)
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
  const { isNewChannel, projectData, username, channelId } = req.body;

  try {
    if (isNewChannel && projectData) {
      const { email, projectName, projectDetails } = projectData;
      const newChannelId = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${convertEmailToStreamFormat(email)}`;
      const channelData = {
        name: projectName,
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

      await channel.sendMessage({
        text: `Welcome to ${projectName}! This channel has been created for project management and communication.`,
        user_id: convertEmailToStreamFormat(email)
      });

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
        text: 'Attendance',
        type: 'regular',
        action_type: 'attendance',
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
    const { userId, projectId, datetime, status, messageId } = req.body;
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
        // Check if error is due to message not found
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
    await serverClient.deleteMessage(messageId, true);

    await serverClient.channel("messaging", projectId).sendMessage({
      user_id: userId,
      id: messageId,
      text: `${status === 'checkin' ? 'Checkin': 'Checkout' } Done`,
      type: 'regular',
      restricted_visibility: [userId]
    });
    res.status(201).json({
      status: 'success',
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


app.post('/send-attendance-message', async (req, res) => {
  try {
    const { userId, projectId } = req.body;
    
    if (!userId || !projectId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const user = await serverClient.queryUsers({ id: userId });
    const userName = user.users[0]?.name || convertStreamToEmail(userId);

    const channel = serverClient.channel('messaging', projectId);
    
    await channel.watch();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const messages = await channel.state.messages;
   
    const userAttendanceMessages = messages
      .filter(m => {
        const isAttendance = m.action_type === 'attendance';
        const isUserMessage = m.user?.id === userId;
        return isAttendance && isUserMessage;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());


    if (userAttendanceMessages.length > 0) {
      const lastMessage = userAttendanceMessages[0];
      const messageTime = new Date(lastMessage.created_at);
      const currentTime = new Date();
      const hoursDiff = (currentTime.getTime() - messageTime.getTime()) / (1000 * 60 * 60);

      if (hoursDiff < 12) {
        const messageText = lastMessage.text || '';
        
        res.status(200).json({
          status: 'success',
          message: 'Attendance message already sent within last 12 hours',
          messageId: lastMessage.id,
          action: messageText.toLowerCase().includes('check in') ? 'checkin' : 'checkout'
        });
        return;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendanceRecords = await Attendance.find({
      userId,
      projectId,
      datetime: {
        $gte: today,
        $lt: tomorrow
      }
    }).sort({ datetime: -1 });

    let shouldCheckIn = true;
    if (attendanceRecords.length > 0) {
      const lastRecord = attendanceRecords[0];
      shouldCheckIn = lastRecord.status === 'checkout';
    }

    try {
      const response = await channel.sendMessage({
        user_id: userId,
        text: shouldCheckIn 
          ? `Dear ${userName},
          Please check in to the project to record your attendance. Your check-in time has not been registered yet.`
          : `Dear ${userName},
          Please check out from the project to record your attendance. Your check-out time has not been registered yet.`,
        type: 'regular',
        action_type: 'attendance',
        show_in_channel: true
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      res.status(201).json({
        status: 'success',
        message: 'Attendance message sent successfully',
        messageId: response.message.id,
        action: shouldCheckIn ? 'checkin' : 'checkout'
      });
    } catch (sendError: any) {
      console.error('Error sending message:', sendError);
      res.status(500).json({ 
        error: 'Failed to send attendance message',
        details: sendError.message 
      });
    }
  } catch (error: any) {
    console.error('Error in attendance message process:', error);
    res.status(500).json({ 
      error: 'Failed to process attendance message',
      details: error.message 
    });
  }
});

app.get('/check-message-status', async (req, res) => {
  try {
    const { messageId, projectId } = req.query;

    if (!messageId || !projectId) {
      res.status(400).json({ error: 'Missing required fields: messageId and projectId' });
      return;
    }

    const channel = serverClient.channel('messaging', projectId as string);
    await channel.watch();
    const messages = await channel.state.messages;
    const message = messages.find(m => m.id === messageId);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const messageDetails = {
      id: message.id,
      text: message.text,
      user_id: message.user_id,
      created_at: message.created_at,
      status: message.status,
      type: message.type,
      action_type: message.action_type,
      restricted_visibility: message.restricted_visibility
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


app.get('/projects', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'Missing or invalid userId' });
      return;
    }

    const channels = await serverClient.queryChannels({
      members: { $in: [userId as string] },
      type: 'messaging'
    });

    const projects = channels
      .map(channel => {
        const location = channel.data?.location;
        const hasCoordinates = location && 
          typeof location === 'object' && 
          'type' in location && 
          'coordinates' in location &&
          Array.isArray(location.coordinates) &&
          location.coordinates.length === 2;
          
        if (!hasCoordinates) return null;

        return {
          projectId: channel.id,
          projectName: channel.data?.name || '',
          createdBy: channel.data?.created_by_id || '',
          projectDetails: channel.data?.projectDetails || {},
          qrCode: channel.data?.qrCode || '',
          location: location.coordinates
        };
      })
      .filter(project => project !== null);

    res.status(200).json({
      status: 'success',
      data: projects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
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