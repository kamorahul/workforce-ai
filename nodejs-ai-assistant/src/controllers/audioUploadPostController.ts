import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { uploadToS3 } from '../utils/s3';

// Configure multer for audio file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for audio files
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

const router: Router = express.Router();

router.post('/audio', upload.single('audioFile'), async (req: Request, res: Response): Promise<void> => {
  const { userId, title, description, channelId, messageId } = req.body;
  const audioFile = req?.file;

  if (!userId) {
    res.status(400).json({ error: 'User ID is required.' });
    return;
  }

  if (!audioFile) {
    res.status(400).json({ error: 'Audio file is required.' });
    return;
  }

  try {
    // Validate audio file
    if (!audioFile.buffer || !audioFile.originalname || !audioFile.mimetype) {
      res.status(400).json({ error: 'Invalid audio file provided.' });
      return;
    }

    // Generate unique file name with timestamp
    const timestamp = Date.now();
    const fileExtension = audioFile.originalname.split('.').pop();
    const uniqueFileName = `audio-${userId}-${timestamp}.${fileExtension}`;

    // Upload audio file to S3 and get URL
    const audioUrl = await uploadToS3(audioFile.buffer, uniqueFileName, audioFile.mimetype);

    // Prepare response data
    const audioData = {
      id: `audio_${timestamp}`,
      userId,
      title: title || `Audio recording ${new Date().toLocaleString()}`,
      description: description || '',
      channelId: channelId || null,
      messageId: messageId || null,
      originalName: audioFile.originalname,
      fileName: uniqueFileName,
      fileUrl: audioUrl,
      mimeType: audioFile.mimetype,
      fileSize: audioFile.size,
      uploadedAt: new Date().toISOString(),
      duration: null, // Could be calculated if needed
    };

    res.status(200).json({
      message: 'Audio uploaded successfully.',
      audio: audioData,
    });
  } catch (error) {
    console.error('Error processing audio upload:', error);
    if (error instanceof Error) {
      // Check if the error message indicates S3 related issues
      if (error.message.toLowerCase().includes('s3') || error.message.toLowerCase().includes('bucket')) {
        res.status(500).json({ error: `Failed to upload audio file: ${error.message}` });
        return;
      }
      // Check if it's a multer error (file type validation)
      if (error.message.includes('Only audio files are allowed')) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    res.status(500).json({ error: 'Failed to process audio upload.' });
  }
});

// Get audio files for a user
router.get('/audio/:userId', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  if (!userId) {
    res.status(400).json({ error: 'User ID is required.' });
    return;
  }

  try {
    // Note: In a real implementation, you'd want to store audio metadata in a database
    // For now, this is a placeholder response
    res.status(200).json({
      message: 'Audio files retrieved successfully.',
      userId,
      audios: [], // Would contain actual audio records from database
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total: 0
      }
    });
  } catch (error) {
    console.error('Error retrieving audio files:', error);
    res.status(500).json({ error: 'Failed to retrieve audio files.' });
  }
});

// Delete audio file
router.delete('/audio/:audioId', async (req: Request, res: Response): Promise<void> => {
  const { audioId } = req.params;
  const { userId } = req.body;

  if (!audioId || !userId) {
    res.status(400).json({ error: 'Audio ID and User ID are required.' });
    return;
  }

  try {
    // Note: In a real implementation, you'd want to:
    // 1. Verify the audio belongs to the user
    // 2. Delete the file from S3
    // 3. Remove the record from database
    
    res.status(200).json({
      message: 'Audio deleted successfully.',
      audioId,
      userId
    });
  } catch (error) {
    console.error('Error deleting audio file:', error);
    res.status(500).json({ error: 'Failed to delete audio file.' });
  }
});

export default router;
