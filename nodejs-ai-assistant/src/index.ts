import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createAgent, User } from './agents/createAgent';
import { apiKey, serverClient } from './serverClient';
import {auth} from 'express-oauth2-jwt-bearer'
import { connectDB } from './config/mongodb';
import { Attendance } from './models/Attendance';
import { AttendanceLog } from './models/AttendanceLog';
import { SentMessageLog } from './models/SentMessageLog';
import { convertEmailToStreamFormat, convertStreamToEmail } from './utils/index';
import { setupAutoAttendanceCronJob } from './cron/autoAttendance';

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
  // Use 'name' and 'image' from req.body
  const { username, name, image } = req.body;

  if (!username) {
    res.status(400).json({ err: "Username is required" });
    return;
  }

  const token = serverClient.createToken(username);
  try {
    // 1. User Upsert Logic
    const userDataToUpsert: { id: string; name?: string; image?: string } = { id: username };
    if (name) { // Use 'name'
      userDataToUpsert.name = name;
    }
    if (image) { // Use 'image'
      userDataToUpsert.image = image;
    }
    await serverClient.upsertUser(userDataToUpsert);

    const channelKai = serverClient.channel('messaging', `kai${username}`, {
      name: 'Kai',
      created_by_id: username,
    });
    await channelKai.create();
    await channelKai.addMembers([username, 'Kai']);
    await channelKai.hide(username); // Hide for "kai" channel

    // 3. "tai" Channel Logic
    const channelTai = serverClient.channel('messaging', `tai_${username}`, {
      name: 'Tai',
      created_by_id: username,
    });
    await channelTai.create();
    await channelTai.addMembers([username, 'tai']);
    // DO NOT hide for "tai" channel: await channelTai.hide(username);

    // Respond with user details, reflecting parameters used for upsert
    res.status(200).json({ user: { username, name: userDataToUpsert.name, image: userDataToUpsert.image }, token });

  } catch (err: any) {
    console.error(`Error in /join endpoint for user ${username}:`, err);
    res.status(500).json({ err: err.message });
    return;
  }
})


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

    // Create and save AttendanceLog
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

    await serverClient.deleteMessage(messageId, true);

    await serverClient.channel("messaging", `tai_${userId}`).sendMessage({
      user_id: userId,
      id: messageId,
      text: `${status === 'checkin' ? 'Checkin': 'Checkout' } Done for project ${projectName} at ${new Date(datetime).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}`,
      type: 'regular',
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
    const { userId, projectId, projectName, action } = req.body;

    console.log('send-attendance-message Called: ', req.body);
    if (!userId || !projectId || !action || !projectName) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const user = await serverClient.queryUsers({ id: userId });
    const userName = user.users[0]?.name || convertStreamToEmail(userId);
    const channel = serverClient.channel('messaging', `tai_${userId}`);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const eventDateForLog = new Date(todayStart); // For SentMessageLog

    if (action === 'checkin') {
      // Query for existing check-in records for the day
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
        // First Enter: Check if prompt already sent today
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

        // Send check-in prompt
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
            checkInTime: new Date(),
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
          res.status(200).json({
            error: 'Failed to send check-in message',
            details: sendError.message,
          });
        }
      } else {
        // Already checked in today, no prompt needed
        res.status(200).json({
          status: 'info',
          message: 'Already checked in today. No message sent.',
          action: 'checkin',
        });
      }
    } else if (action === 'checkout') {
      // Last Exit: Check if prompt already sent today
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

      // Send check-out prompt
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
          checkOutTime: new Date(),
        });

        res.status(201).json({
          status: 'success',
          message: 'Attendance message sent successfully',
          messageId: response.message.id,
          action: 'checkout',
        });
      } catch (sendError: any) {
        console.error('Error sending check-out message:', sendError);
        res.status(200).json({
          error: 'Failed to send check-out message',
          details: sendError.message,
        });
      }
    } else {
      // Invalid action
      res
          .status(400)
          .json({
            error: 'Invalid action specified. Must be "checkin" or "checkout".',
          });
    }

    // Create and save AttendanceLog
    try {
      const attendanceLog = new AttendanceLog({
        userId,
        projectId,
        timestamp: new Date(),
        action: action === 'checkin' ? 'ENTER' : 'EXIT',
      });
      await attendanceLog.save();
    } catch (logError) {
      console.error('Error saving AttendanceLog:', logError);
      // For now, we just log the error and don't let it affect the main response
    }
  } catch (error: any) {
    console.error('Error in send-attendance-message process:', error);
    res.status(500).json({
      error: 'Failed to process attendance message',
      details: error.message,
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
    const messages = channel.state.messages;
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

    const projectsPromises = channels.map(async (channel) => {
      const location = channel.data?.location;
      const hasCoordinates = location &&
          typeof location === 'object' &&
          'type' in location &&
          'coordinates' in location &&
          Array.isArray(location.coordinates) &&
          location.coordinates.length === 2;

      if (!hasCoordinates) return null;

      const lastLog = await AttendanceLog.findOne({
        projectId: channel.id,
        userId: userId as string,
      }).sort({ timestamp: -1 }).limit(1);

      return {
        projectId: channel.id,
        projectName: channel.data?.name || '',
        createdBy: channel.data?.created_by_id || '',
        projectDetails: channel.data?.projectDetails || {},
        qrCode: channel.data?.qrCode || '',
        location: location.coordinates,
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

// Start the Express server
const port = process.env.PORT || 3000;
app.listen(port, async () => {
  try {
    await connectDB();
    console.log(`Server is running on http://localhost:${port}`);
    setupAutoAttendanceCronJob(); // Initialize and start the cron job
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