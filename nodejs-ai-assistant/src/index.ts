import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { serverClient } from './serverClient'; // apiKey removed as it's unused
import joinPostControllerRouter from './controllers/joinPostController'; // Renamed for clarity
import channelJoinPostControllerRouter from './controllers/channelJoinPostController';
import getstreamWebhooksPostControllerRouter from './controllers/getstreamWebhooksPostController';
import webhookPostControllerRouter from './controllers/webhookPostController';
import attendancePostControllerRouter from './controllers/attendancePostController';
import attendanceGetControllerRouter from './controllers/attendanceGetController';
import sendAttendanceMessagePostControllerRouter from './controllers/sendAttendanceMessagePostController';
import checkMessageStatusGetControllerRouter from './controllers/checkMessageStatusGetController';
import projectsGetControllerRouter from './controllers/projectsGetController';
import { auth } from 'express-oauth2-jwt-bearer';
import { connectDB } from './config/mongodb';
import { setupAutoAttendanceCronJob } from './cron/autoAttendance';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

// Map to store the AI Agent instances - This seems unused, consider removal if not needed by other parts of the application.
// [cid: string]: AI Agent
app.get('/', (req, res) => {
  res.json({
    message: 'GetStream AI Server is running',
    // apiKey usage was already commented out
  });
});

// Use the new controller for the /join route
app.use('/join', joinPostControllerRouter); // Updated to new router name

// Mount new controllers
app.use('/channel-join', channelJoinPostControllerRouter);
app.use('/getstream/webhooks', getstreamWebhooksPostControllerRouter);
app.use('/webhook', webhookPostControllerRouter);
app.use('/attendance', attendancePostControllerRouter);
app.use('/attendance', attendanceGetControllerRouter); // Note: Both POST and GET for /attendance use the same base path
app.use('/send-attendance-message', sendAttendanceMessagePostControllerRouter);
app.use('/check-message-status', checkMessageStatusGetControllerRouter);
app.use('/projects', projectsGetControllerRouter);

// connectDB(); // Assuming this is called elsewhere or on startup
// setupAutoAttendanceCronJob(); // Assuming this is called elsewhere or on startup

export { app }; // Export the app instance