import express, { Request, Response, Router } from 'express';
import { createAgent, User } from '../agents/createAgent';
import { agent } from 'supertest';
import { AIAgent } from '../agents/types';
import { serverClient } from '../serverClient';

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

    // Skip processing if message is already being analyzed (prevents loop)
    if (message.extraData && message.extraData.processing === true) {
      console.log("Message already being processed, skipping...");
      res.status(200).json({ message: "Message already being processed" });
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
      // Check if this is a threaded reply (has parent_id)
      const parentId = message.parent_id;
      let threadContext = null;

      if (parentId) {
        console.log(`🧵 Threaded reply detected, parent_id: ${parentId}`);
        try {
          const parentMessage = await serverClient.getMessage(parentId);

          if (parentMessage?.message) {
            const extraData = parentMessage.message.extraData as any;
            threadContext = {
              parentId: parentId,
              parentText: parentMessage.message.text || '',
              parentUser: parentMessage.message.user?.name || parentMessage.message.user?.id || 'Unknown',
              parentIstask: extraData?.istask
            };
            console.log(`📝 Parent message context: "${threadContext.parentText}" by ${threadContext.parentUser}`);
          }
        } catch (err) {
          console.error('Error fetching parent message:', err);
        }
      }

      // Extract attachments for Vision API analysis (screenshots, images)
      let attachments: any[] = [];
      if (message.attachments && message.attachments.length > 0) {
        attachments = message.attachments.map((att: any) => ({
          type: att.type,
          mime_type: att.mime_type,
          url: att.image_url || att.asset_url || att.file_url,
          name: att.title || att.name || att.fallback || 'attachment'
        }));
        console.log('📎 Attachments for task/event detection:', attachments.length, 'file(s)');
      }

      doAnalyzeMessage(agent, user, message, threadContext, attachments);
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

    // Extract mentioned users for task/event assignment
    const mentionedUsers = message.mentioned_users?.map((u: any) => ({
      id: u.id,
      name: u.name || u.id
    })) || [];

    if (mentionedUsers.length > 0) {
      console.log('👥 Mentioned users:', mentionedUsers.map((u: any) => `${u.name} (${u.id})`).join(', '));
    }

    // Use persistent thread = true for Q&A agent (remembers conversation)
    await agent.handleMessage(messageText, message.id, attachments, true, mentionedUsers);

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error('Webhook processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Internal server error', details: errorMessage });
  }
});

async function doAnalyzeMessage(agent: AIAgent, user: User, message: any, threadContext?: any, attachments?: any[]) {
  // Mark message as processing immediately so mobile can show analyzing UI
  try {
    await serverClient.updateMessage({
      id: message.id,
      text: message.text,
      user_id: user.id,
      extraData: { processing: true }
    });
    console.log('🔄 Marked message as processing');
  } catch (err) {
    console.error('Failed to mark message as processing:', err);
  }

  await agent.init("asst_ercPXUnj2oTtMpqjk4cfJWCD");

  let messageToAnalyze = '';

  if (threadContext) {
    // Include parent message context for threaded replies
    messageToAnalyze = `[THREADED CONVERSATION]
Parent message by ${threadContext.parentUser}: "${threadContext.parentText}"
Reply by ${user.name}: "${message.text}"

Analyze if this thread contains a task or event. Consider the parent message context and the reply together.`;

    console.log(`🧵 Analyzing threaded message with parent context`);
  } else {
    // Single message analysis
    messageToAnalyze = `${user.name}: ${message.text}`;
  }

  // Add instruction if there are image attachments
  if (attachments && attachments.length > 0) {
    const hasImages = attachments.some((att: any) =>
      att.type === 'image' ||
      att.mime_type?.startsWith('image/') ||
      att.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    );

    if (hasImages) {
      messageToAnalyze += `\n\n[IMAGE ATTACHED - Analyze the image for any task or event information like dates, times, meeting details, deadlines, etc.]`;
      console.log('🖼️ Image detected - will use Vision API for analysis');
    }
  }

  // Pass attachments for Vision API processing
  await agent.handleMessage(messageToAnalyze, message.id, attachments || []);
}

export default router;