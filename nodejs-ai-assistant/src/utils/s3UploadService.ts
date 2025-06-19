import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Express } from "express";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png"];

export const uploadFileToS3 = async (
  file: Express.Multer.File,
  bucketName: string
): Promise<string> => {
  // Validate file type
  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    throw new Error(
      `Invalid file type: ${
        file.mimetype
      }. Only ${ALLOWED_FILE_TYPES.join(", ")} are allowed.`
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds the limit of ${MAX_FILE_SIZE / 1024 / 1024}MB.`
    );
  }

  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = process.env;

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION) {
    throw new Error("AWS credentials or region not configured in environment variables.");
  }

  const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });

  const key = `${uuidv4()}-${file.originalname}`;

  const params = {
    Bucket: bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    return `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw new Error("Failed to upload file to S3.");
  }
};
