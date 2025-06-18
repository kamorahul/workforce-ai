import express, { Request, Response, Router } from 'express';
import { serverClient } from '../serverClient'; // Adjusted path

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  // Use 'name' and 'image' from req.body
  const { username, name, image } = req.body;

  console.log('Req.Body: ', JSON.stringify(req.body));

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
});

export default router;
