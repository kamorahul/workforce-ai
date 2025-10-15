import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { uploadToS3 } from '../utils/s3';
import { serverClient } from '../serverClient';

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

const router: Router = express.Router();

router.post('/profile', upload.single('profilePicture'), async (req: Request, res: Response): Promise<void> => {
  const { userId, name, email, displayName, title } = req.body;
  const profilePictureFile = req?.file;

  if (!userId) {
    res.status(400).json({ error: 'User ID is required.' });
    return;
  }

  const userDataToUpdate: { [key: string]: any } = {};

  if (name) {
    userDataToUpdate.name = name;
  }

  if (email) {
    userDataToUpdate.email = email;
  }

  if (displayName) {
    userDataToUpdate.displayName = displayName;
  }

  if (title) {
    userDataToUpdate.title = title;
  }

  try {
    if (profilePictureFile) {
      if (!profilePictureFile.buffer || !profilePictureFile.originalname || !profilePictureFile.mimetype) {
        res.status(400).json({ error: 'Invalid profile picture file provided.' });
        return;
      }
      const s3Url = await uploadToS3(profilePictureFile.buffer, profilePictureFile.originalname, profilePictureFile.mimetype);
      userDataToUpdate.image = s3Url;
    }

    if (Object.keys(userDataToUpdate).length === 0) {
       res.status(400).json({ error: 'No profile data provided to update.' });
       return;
    }

    const updatedUser = await serverClient.partialUpdateUser({
      id: userId,
      set: userDataToUpdate,
    });

    res.status(200).json({
      message: 'Profile updated successfully.',
      user: updatedUser.users[userId],
    });
  } catch (error) {
    console.error('Error processing profile update:', error);
    if (error instanceof Error) {
        // Check if the error message indicates S3 related issues
        if (error.message.toLowerCase().includes('s3') || error.message.toLowerCase().includes('bucket')) {
             res.status(500).json({ error: `Failed to upload profile picture: ${error.message}` });
             return;
        }
    }
    res.status(500).json({ error: 'Failed to process profile update.' });
  }
});

export default router;
