import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import joinPostControllerRouter from './controllers/joinPostController'; // Renamed for clarity
import channelJoinPostControllerRouter from './controllers/channelJoinPostController';
import getstreamWebhooksPostControllerRouter from './controllers/getstreamWebhooksPostController';
import webhookPostControllerRouter from './controllers/webhookPostController';
import attendancePostControllerRouter from './controllers/attendancePostController';
import attendanceGetControllerRouter from './controllers/attendanceGetController';
import sendAttendanceMessagePostControllerRouter from './controllers/sendAttendanceMessagePostController';
import checkMessageStatusGetControllerRouter from './controllers/checkMessageStatusGetController';
import projectsGetControllerRouter from './controllers/projectsGetController';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

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

export { app }; // Export the app instance