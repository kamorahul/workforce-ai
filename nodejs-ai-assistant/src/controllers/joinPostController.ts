import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient'; // Adjusted path

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  // Use 'name' and 'image' from req.body
  const { username, name, image } = req.body;
  if (!username) {
    res.status(400).json({ err: "Username is required" });
    return;
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
