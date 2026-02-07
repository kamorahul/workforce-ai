import express, { Request, Response, Router } from 'express';
import { createAgent, User } from '../agents/createAgent';
import { AIAgent, TimezoneContext } from '../agents/types';
import { serverClient } from '../serverClient';

const router: Router = express.Router();

/**
 * Process voice message transcription through AI
 * Called by mobile app after transcription is complete
 * This triggers the same AI processing as text messages for task/event creation
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("=== Process Voice Message ===");

    const { messageId, channelId, transcription, timezoneContext, userId } = req.body;

    // Validate required fields
    if (!messageId || !channelId || !transcription || !userId) {
      console.error("Missing required fields:", { messageId, channelId, transcription: !!transcription, userId });
      res.status(400).json({
        error: 'Missing required fields',
        required: ['messageId', 'channelId', 'transcription', 'userId']
      });
      return;
    }

    console.log(`📝 Processing voice transcription for message: ${messageId}`);
    console.log(`   Channel: ${channelId}`);
    console.log(`   User: ${userId}`);
    console.log(`   Transcription: "${transcription.substring(0, 100)}${transcription.length > 100 ? '...' : ''}"`);

    // Parse channel ID (format: "messaging:channel_id")
    const channelParts = channelId.split(':');
    const channelType = channelParts[0] || 'messaging';
    const channelIdOnly = channelParts[1] || channelId;

    // Get the original message to check if already processed
    try {
      const originalMessage = await serverClient.getMessage(messageId);
      const extraData = originalMessage?.message?.extraData as Record<string, any> | undefined;
      if (extraData?.istask !== undefined) {
        console.log("Message already processed (has istask field), skipping...");
        res.status(200).json({ message: "Message already processed" });
        return;
      }
    } catch (err) {
      console.error('Error fetching original message:', err);
      // Continue processing even if we can't fetch the message
    }

    // Create user object for agent
    const user: User = {
      id: userId,
      role: 'user',
      created_at: new Date(),
      updated_at: new Date(),
      last_active: new Date(),
      last_engaged_at: new Date(),
      banned: false,
      online: true,
      name: userId,
      image: '',
    };

    // Create AI agent
    const agent = await createAgent(user, channelType, channelIdOnly);

    // Check if this is a Kai channel
    const isKaiChannel = channelIdOnly.indexOf('kai') === 0;

    if (isKaiChannel) {
      // FOR KAI CHANNELS: Use Q&A Assistant with conversation memory
      console.log('🤖 Processing voice message for Kai channel with Q&A Assistant');

      const qaAssistantId = process.env.OPENAI_QA_ASSISTANT_ID || "asst_SIcQ1bD17QezZbQIQEzuYMhg";
      await agent.init(qaAssistantId);

      // Parse timezone context if provided
      const parsedTimezoneContext: TimezoneContext | undefined = timezoneContext;

      if (parsedTimezoneContext) {
        console.log('🌍 Timezone context:', parsedTimezoneContext.timezone);
      }

      // Process as a voice message with transcription
      await agent.handleMessage(
        transcription,
        messageId,
        [], // No attachments - voice already transcribed
        true, // Use persistent thread for Kai
        [], // No mentioned users in voice message
        parsedTimezoneContext
      );

      res.status(200).json({
        success: true,
        message: "Voice message processed for Kai channel"
      });
    } else {
      // FOR REGULAR CHANNELS: Use task detection
      console.log('📋 Processing voice message for task/event detection');

      // Mark message as processing
      try {
        await serverClient.updateMessage({
          id: messageId,
          text: '', // Voice messages don't have text
          user_id: userId,
          extraData: { processing: true }
        });
        console.log('🔄 Marked message as processing');
      } catch (err) {
        console.error('Failed to mark message as processing:', err);
      }

      // Initialize task detection agent
      await agent.init("asst_ercPXUnj2oTtMpqjk4cfJWCD");

      // Format message for analysis
      const messageToAnalyze = `[VOICE MESSAGE TRANSCRIPTION]\n${user.name}: ${transcription}`;

      // Parse timezone context
      const parsedTimezoneContext: TimezoneContext | undefined = timezoneContext;

      if (parsedTimezoneContext) {
        console.log('🌍 Timezone context:', parsedTimezoneContext.timezone);
      }

      // Process for task/event detection
      await agent.handleMessage(
        messageToAnalyze,
        messageId,
        [],
        false, // Don't use persistent thread for task detection
        undefined,
        parsedTimezoneContext
      );

      res.status(200).json({
        success: true,
        message: "Voice message processed for task detection"
      });
    }

  } catch (error) {
    console.error('Process voice message error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal server error',
      details: errorMessage
    });
  }
});

export default router;
