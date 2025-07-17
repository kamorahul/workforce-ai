import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient'; // Adjusted path
import { UserJoinLog } from '../models/UserJoinLog';
import { DailyEventLog } from '../models/DailyEventLog';
import { createAgent, User as AgentUser } from '../agents/createAgent';

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  // Use 'name' and 'image' from req.body
  const { username, name, image } = req.body;
  if (!username) {
    res.status(400).json({ err: "Username is required" });
    return;
  }

  // Track unique user join
  try {
    await UserJoinLog.updateOne(
      { userId: username },
      { $setOnInsert: { userId: username, joinedAt: new Date() } },
      { upsert: true }
    );
    console.log("Trigger daily event for this user if not already triggered today")
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existingDaily = await DailyEventLog.findOne({ userId: username, eventDate: today });
    if (!existingDaily) {
      await DailyEventLog.create({ userId: username, eventDate: today });
      console.log(`Daily event triggered for userId: ${username} on ${today.toISOString()}`);
      // Call agent.handleMessage
      const agentUser: AgentUser = {
        id: username,
        role: 'user',
        created_at: new Date(),
        updated_at: new Date(),
        last_active: new Date(),
        last_engaged_at: new Date(),
        banned: false,
        online: false,
        name: name || username,
        image: image || '',
      };

      const agent = await createAgent(agentUser, 'messaging', `kai${username}`);
      await agent.init('asst_1S24D5a6stMWlbPAMhJSsLIX'); // Use a default assistant id, adjust as needed
      agent.handleMessage('Daily event triggered for user.');
    } else {
      console.log(`Daily event already triggered for userId: ${username} on ${today.toISOString()}`);
    }
  } catch (err) {
    console.error('Error logging user join or daily event:', err);
  }

  const token = serverClient.createToken(username);
  try {
     // Create AI users first before adding them to channels
    await serverClient.upsertUser({
      id: 'Kai',
      name: 'Kai',
      role: 'admin',
      image: 'https://cdn-icons-png.flaticon.com/512/1077/1077012.png'
    });

    await serverClient.upsertUser({
      id: 'tai',
      name: 'Tai',
      role: 'admin',
      image: 'https://cdn-icons-png.flaticon.com/512/1077/1077012.png'
    });
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

    // Respond with user details, reflecting parameters used for upsert
    res.status(200).json({ user: { username, name, image }, token });

  } catch (err: any) {
    console.error(`Error in /join endpoint for user ${username}:`, err);
    res.status(500).json({ err: err.message });
    return;
  }
});

export default router;
