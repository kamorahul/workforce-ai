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

    // Skip processing if message already has istask field (prevents loop)
    if (message.extraData && message.extraData.istask !== undefined) {
      console.log("Message already processed (has istask field), skipping...");
      res.status(200).json({ message: "Message already processed" });
      return;
    }

    // Skip processing if message text is empty (usually means it's an update)
    if (!message.text || message.text.trim() === '') {
      console.log("Message has no text, skipping...");
      res.status(200).json({ message: "No text to process" });
      return;
    }

    // Skip processing messages FROM Kai or Tai to prevent infinite loops
    if (user.id === 'kai' || user.id === 'Kai' || user.id === 'tai') {
      console.log(`Skipping message from AI user: ${user.id}`);
      res.status(200).json({ message: "Skipped AI user message" });
      return;
    }

    const agent = await createAgent(user as User, channel.type, channel.id);

    // For regular channels (not kai channels), use task detection
    if(channel.id.indexOf('kai') !== 0) {
      doAnalyzeMessage(agent, user, message);
      res.json(req.body);
      return;
    }

    // FOR KAI CHANNELS: Use Q&A Assistant with PERSISTENT thread (conversation memory)
    const qaAssistantId = process.env.OPENAI_QA_ASSISTANT_ID || "asst_SIcQ1bD17QezZbQIQEzuYMhg";
    console.log('🤖 Using Q&A Assistant for kai channel:', qaAssistantId);
    
    await agent.init(qaAssistantId);

    let messageText = message.text || '';
    let attachments = [];
    
    // Process attachments (images and documents)
    if(message.attachments && message.attachments.length > 0) {
      attachments = message.attachments.map((att: any) => ({
        type: att.type,
        mime_type: att.mime_type,
        url: att.image_url || att.asset_url || att.file_url,
        name: att.title || att.name || att.fallback || att.originalImage?.filename || att.originalImage?.name || 'attachment',
        filename: att.originalImage?.filename || att.originalImage?.name || att.fallback || att.title || att.name
      }));
      
      if (!messageText || messageText.trim() === '') {
        messageText = 'Please analyze this file.';
      }
      
      console.log('📎 Attachments detected:', attachments.length, 'file(s)');
    }
    
    // Use persistent thread = true for Q&A agent (remembers conversation)
    await agent.handleMessage(messageText, message.id, attachments, true);

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