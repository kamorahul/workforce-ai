import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient'; // Adjusted path
import { UserJoinLog } from '../models/UserJoinLog';
import { DailyEventLog } from '../models/DailyEventLog';
import { User } from '../models/User';
import { createAgent, User as AgentUser } from '../agents/createAgent';

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  // Use 'name', 'image', and timezone from req.body
  const { username, name, image, timezone, timezoneOffset, timezoneAbbreviation } = req.body;
  if (!username) {
    res.status(400).json({ err: "Username is required" });
    return;
  }

  // Upsert user with timezone info
  try {
    await User.findOneAndUpdate(
      { userId: username },
      {
        $set: {
          name: name || undefined,
          image: image || undefined,
          timezone: timezone || 'UTC',
          timezoneOffset: timezoneOffset,
          timezoneAbbreviation: timezoneAbbreviation,
        },
        $setOnInsert: {
          userId: username,
        },
      },
      { upsert: true, new: true }
    );
    console.log(`User ${username} timezone updated: ${timezone || 'UTC'}`);
  } catch (err) {
    console.error('Error upserting user:', err);
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
      
      // Fetch user info from getstream
      let fetchedUser;
      try {
        const response = await serverClient.queryUsers({ id: username });
        fetchedUser = response.users[0];
      } catch (err) {
        console.error('Error fetching user from getstream:', err);
        fetchedUser = null;
      }

      // Call agent.handleMessage
      const agentUser: AgentUser = {
        id: username,
        role: 'user',
        created_at: fetchedUser?.created_at ? new Date(fetchedUser.created_at) : new Date(),
        updated_at: fetchedUser?.updated_at ? new Date(fetchedUser.updated_at) : new Date(),
        last_active: fetchedUser?.last_active ? new Date(fetchedUser.last_active) : new Date(),
        last_engaged_at: new Date(),
        banned: fetchedUser?.banned || false,
        online: fetchedUser?.online || false,
        name: fetchedUser?.name || name || username,
        image: fetchedUser?.image || image || '',
      };

      const agent = await createAgent(agentUser, 'messaging', `kai${username}`);
      await agent.init('asst_IvTo37LM3gDUZ2LTXIgUBeS1'); // Use a default assistant id, adjust as needed
      agent.handleMessage(`Daily event triggered for Name: ${agentUser.name} Username: (${username}).`);
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
    // await channelKai.hide(username); // Hide for "kai" channel

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
