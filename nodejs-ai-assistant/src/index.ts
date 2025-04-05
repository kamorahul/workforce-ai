import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createAgent, User } from './agents/createAgent';
import { apiKey, serverClient } from './serverClient';
import {connect} from "mongoose";

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
    await serverClient.upsertUser(
        {
          id: username
        }
    );

    // Ensure the user "Kai" exists
    await serverClient.upsertUser({ id: "Kai", name: "Kai" });

    // Create a new channel (if it doesn’t exist)
    const channel = serverClient.channel('messaging', `kai${username}`, {
      name: `Kai`,
      created_by_id: username, // Set the joining user as the creator
    });

    await channel.create(); // Create channel
    await channel.addMembers([username, "Kai"]); // Add both users
  } catch (err: any) {
    res.status(500).json({ err: err.message });
    return;
  }

   res.status(200).json({ user: { username }, token });
});

/*
* Handle Join chat user
* */
app.post('/getstream/webhooks', async (req, res): Promise<void> => {
  const {
    message,
      user
  } = req.body;

  console.log(message);

  const {cid: channelId} = message
  // Simple validation
  if (!channelId) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  let channelType = 'messaging'
  let channelIdUpdated = channelId;
  if (channelId.includes(':')) {
    const parts = channelId.split(':');
    if (parts.length > 1) {
      channelIdUpdated = parts[1];
      channelType = parts[0];
    }
  }

    const agent = await createAgent(
          user as User,
          channelType,
          channelIdUpdated,
      );

      await agent.init();
      agent.handleMessage(`Generate Summary for ${user.name} for group ${channelIdUpdated}`);
      res.json(req.body)
});

// Start the Express server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});