import mongoose from 'mongoose';
import 'dotenv/config';

const DEFAULT_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/workforce';

export const connectDB = async (uri?: string): Promise<void> => {
  const connectionUri = uri || DEFAULT_MONGODB_URI;
  try {
    await mongoose.connect(connectionUri);
    console.log(`MongoDB connected successfully to ${connectionUri}`);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

// Handle application termination
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error during MongoDB connection closure:', err);
    process.exit(1);
  }
}); 