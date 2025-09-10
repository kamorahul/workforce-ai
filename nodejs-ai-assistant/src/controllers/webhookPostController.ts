import express, { Request, Response, Router } from 'express';
import { createAgent, User } from '../agents/createAgent';
import { agent } from 'supertest';
import { AIAgent } from '../agents/types';

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

    const agent = await createAgent(user as User, channel.type, channel.id);

    if(user.id === 'kai' || channel.id.indexOf('kai') !== 0) {
      doAnalyzeMessage(agent, user, message);
      res.json(req.body);
      return;
    }

    const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_Q8vD9YOGcO3es62kFjeVZI5L";
    
    await agent.init(assistantId);

    let messageText = message.text || '';
    if(message.attachments && message.attachments.length > 0) {
      messageText += `: ${message.attachments[0].toString()}`;
    }
    
    await agent.handleMessage(messageText, message.id);

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error('Webhook processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Internal server error', details: errorMessage });
  }
});

async function doAnalyzeMessage(agent: AIAgent, user: User, message: any) {
  await agent.init("asst_ercPXUnj2oTtMpqjk4cfJWCD");
  await agent.handleMessage(`${user.name}: ${message.text}`, message.id);
}

export default router;