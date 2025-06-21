import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const bucketName = process.env.S3_BUCKET_NAME;

export const uploadToS3 = async (fileBuffer: Buffer, fileName: string, contentType: string): Promise<string> => {
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME environment variable is not set.');
  }

  const folderPath = 'onboard-lo/local/employeeDocs/';
  const fileKey = `${folderPath}${fileName}`;

  const params = {
    Bucket: bucketName,
    Key: fileKey,
    Body: fileBuffer,
    ContentType: contentType,
    ACL: 'public-read',
  };

  try {
    const data = await s3.upload(params).promise();
    return data.Location;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};
