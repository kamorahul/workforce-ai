import mongoose from 'mongoose';
import 'dotenv/config';

// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/workforce'; // Don't use this
let listenersAttached = false;

export const connectDB = async (): Promise<void> => {
  try {
    // Ensure no existing connection is hanging before attempting a new one, especially for tests.
    // Read MONGODB_URI dynamically inside the function
    const currentMongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/workforce';

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(currentMongoUri);
    console.log('MongoDB connected successfully to:', currentMongoUri);

    if (!listenersAttached) {
      // Handle connection events - attach only once
      mongoose.connection.on('connected', () => {
        console.log('Mongoose connected to MongoDB');
      });

      mongoose.connection.on('error', (err) => {
        console.error('Mongoose connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('Mongoose disconnected from MongoDB');
      });
      listenersAttached = true;
    }

  } catch (error) {
    console.error('MongoDB connection error:', error);
    // process.exit(1); // Avoid exiting in tests
    throw error; // Re-throw error to be caught by test or calling function
  }
};

// Handle application termination
// process.on('SIGINT', async () => {
//   try {
//     await mongoose.connection.close();
//     console.log('MongoDB connection closed through app termination');
//     process.exit(0);
//   } catch (err) {
//     console.error('Error during MongoDB connection closure:', err);
//     // process.exit(1); // Avoid exiting in tests
//   }
// });
// For tests, it's better to manage connection closure explicitly in afterAll hooks.
// The SIGINT handler can cause issues with Jest's own process management.
// If this code is intended for production, it should be conditional (e.g., if (process.env.NODE_ENV !== 'test'))
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGINT', async () => {
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    } catch (err) {
      console.error('Error during MongoDB connection closure:', err);
      process.exit(1); // Still might be problematic if other cleanup is needed
    }
  });
}