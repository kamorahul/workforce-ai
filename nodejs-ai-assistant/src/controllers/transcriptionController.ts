import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import {
  transcribeAudio,
  transcribeAudioFromUrl,
  summarizeTranscription,
  TranscriptionResult,
  SummaryResult
} from '../services/transcriptionService';

const router: Router = express.Router();

// Configure multer for audio file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    const allowedMimes = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/m4a',
      'audio/x-m4a'
    ];
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

/**
 * POST /transcribe
 * Transcribe audio from URL
 *
 * Body: { audioUrl: string, language?: string, summarize?: boolean }
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { audioUrl, language, summarize } = req.body;

  if (!audioUrl) {
    res.status(400).json({
      success: false,
      error: 'audioUrl is required'
    });
    return;
  }

  try {
    console.log(`[TranscriptionAPI] Processing URL: ${audioUrl}`);

    // Transcribe audio
    const transcription: TranscriptionResult = await transcribeAudioFromUrl(audioUrl, language);

    // Optionally summarize long transcriptions
    let summary: SummaryResult | null = null;
    if (summarize && transcription.text.length > 200) {
      summary = await summarizeTranscription(transcription.text);
    }

    res.status(200).json({
      success: true,
      transcription: transcription.text,
      duration: transcription.duration,
      language: transcription.language,
      summary: summary?.summary || null,
      keyPoints: summary?.keyPoints || null,
      actionItems: summary?.actionItems || null
    });

  } catch (error) {
    console.error('[TranscriptionAPI] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transcribe audio'
    });
  }
});

/**
 * POST /transcribe/upload
 * Transcribe uploaded audio file directly
 *
 * FormData: audioFile (file), language? (string), summarize? (boolean)
 */
router.post('/upload', upload.single('audioFile'), async (req: Request, res: Response): Promise<void> => {
  const audioFile = req.file;
  const { language, summarize } = req.body;

  if (!audioFile) {
    res.status(400).json({
      success: false,
      error: 'Audio file is required'
    });
    return;
  }

  try {
    console.log(`[TranscriptionAPI] Processing uploaded file: ${audioFile.originalname}`);

    // Transcribe audio buffer
    const transcription: TranscriptionResult = await transcribeAudio(
      audioFile.buffer,
      audioFile.originalname,
      language
    );

    // Optionally summarize
    let summary: SummaryResult | null = null;
    const shouldSummarize = summarize === 'true' || summarize === true;
    if (shouldSummarize && transcription.text.length > 200) {
      summary = await summarizeTranscription(transcription.text);
    }

    res.status(200).json({
      success: true,
      transcription: transcription.text,
      duration: transcription.duration,
      language: transcription.language,
      summary: summary?.summary || null,
      keyPoints: summary?.keyPoints || null,
      actionItems: summary?.actionItems || null
    });

  } catch (error) {
    console.error('[TranscriptionAPI] Upload error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transcribe audio'
    });
  }
});

/**
 * POST /transcribe/summarize
 * Summarize existing transcription text
 *
 * Body: { text: string }
 */
router.post('/summarize', async (req: Request, res: Response): Promise<void> => {
  const { text } = req.body;

  if (!text) {
    res.status(400).json({
      success: false,
      error: 'text is required'
    });
    return;
  }

  try {
    console.log(`[TranscriptionAPI] Summarizing text (${text.length} chars)`);

    const summary = await summarizeTranscription(text);

    res.status(200).json({
      success: true,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      actionItems: summary.actionItems
    });

  } catch (error) {
    console.error('[TranscriptionAPI] Summarize error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to summarize text'
    });
  }
});

export default router;
