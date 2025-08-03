import express, { Request, Response, Router } from 'express';
import { createAgent, User } from '../agents/createAgent';

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("=== Webhook Debug ===");
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));
    
    const {message, user, channel} = req.body;
    
    if (!message || !user || !channel) {
      console.error("Missing required fields");
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    console.log("User:", user);
    console.log("Channel:", channel);
    console.log("Message:", message);

    const agent = await createAgent(user as User, channel.type, channel.id);
    console.log("Agent created successfully");

    if(user.id === 'kai' || channel.id.indexOf('kai') !== 0) {
      console.log("Skipping assistant processing");
      res.json(req.body);
      return;
    }

    const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_Q8vD9YOGcO3es62kFjeVZI5L";
    console.log("Initializing assistant with ID:", assistantId);
    
    await agent.init(assistantId);
    console.log("Assistant initialized successfully");

    let messageText = message.text || '';
    if(message.attachments && message.attachments.length > 0) {
      messageText += `: ${message.attachments[0].toString()}`;
    }
    
    console.log("Processing message:", messageText);
    await agent.handleMessage(messageText);
    console.log("Message processed successfully");

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error('Webhook processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Internal server error', details: errorMessage });
  }
});

export default router;
