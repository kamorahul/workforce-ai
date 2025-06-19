import express, { Request, Response, Router } from "express";
import multer from "multer";
import { uploadFileToS3 } from "../utils/s3UploadService";
import { serverClient } from "../serverClient"; // Import serverClient

// Configure Multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const router: Router = express.Router();

router.post(
  "/",
  upload.single("profilePicture"),
  async (req: Request, res: Response) => {
    const { userId, name, bio } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }

    let profile_image_url: string | undefined;
    const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

    if (!S3_BUCKET_NAME) {
      console.error("S3_BUCKET_NAME environment variable is not set.");
      return res.status(500).json({ error: "Server configuration error: S3 bucket name not set." });
    }

    try {
      // Upload profile picture to S3 if a file is provided
      if (req.file) {
        try {
          profile_image_url = await uploadFileToS3(req.file, S3_BUCKET_NAME);
        } catch (s3Error) {
          console.error("S3 upload error:", s3Error);
          return res.status(500).json({ error: "Failed to upload profile picture." });
        }
      }

      // Prepare data for GetStream update
      const userDataToUpdate: { [key: string]: any } = {};
      if (name) userDataToUpdate.name = name;
      if (bio) userDataToUpdate.bio = bio;
      if (profile_image_url) userDataToUpdate.image = profile_image_url; // Changed field name here

      // Update user profile on GetStream if there's anything to update
      if (Object.keys(userDataToUpdate).length > 0) {
        await serverClient.partialUserUpdate({
          id: userId,
          set: userDataToUpdate,
        });
      } else if (!req.file) {
        // No file uploaded and no other data to update
        return res.status(400).json({ error: "No profile data provided to update." });
      }


      res.status(200).json({
        message: "Profile updated successfully.",
        userId,
        updatedFields: userDataToUpdate,
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      // Consider more specific error handling based on GetStream errors
      if (error instanceof Error) {
        return res.status(500).json({ error: `Failed to update profile: ${error.message}` });
      }
      return res.status(500).json({ error: "An unknown error occurred while updating profile." });
    }
  }
);

export default router;
