import 'dotenv/config';
import { app } from './index'; // Import the configured app instance
import { connectDB } from './config/mongodb';
import { setupAutoAttendanceCronJob } from './cron/autoAttendance';
import { startEventReminderCron } from './services/eventReminderCron';

const port = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Use MONGODB_URI_TEST if in test environment, otherwise use MONGODB_URI from .env
    const mongoUri = process.env.NODE_ENV === 'test' ? process.env.MONGODB_URI_TEST : process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MongoDB URI not found. Please set MONGODB_URI or MONGODB_URI_TEST in your environment.");
    }
    await connectDB(mongoUri); // Pass the URI to connectDB
    console.log('MongoDB connected successfully.');

    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
      if (process.env.NODE_ENV !== 'test') {
        setupAutoAttendanceCronJob(); // Initialize and start the cron job only if not in test environment
        console.log('Auto attendance cron job started.');

        startEventReminderCron(); // Start event reminder cron job
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Export the server instance for potential use in tests if needed, though supertest usually handles this.
// export default startServer; // Or export the http.Server instance if you need more control
// For now, just running startServer is fine for typical scenarios.
