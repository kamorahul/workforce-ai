import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import joinPostControllerRouter from './controllers/joinPostController';
import authControllerRouter from './controllers/authController';
import channelJoinPostControllerRouter from './controllers/channelJoinPostController';
import getstreamWebhooksPostControllerRouter from './controllers/getstreamWebhooksPostController';
import webhookPostControllerRouter from './controllers/webhookPostController';
import attendancePostControllerRouter from './controllers/attendancePostController';
import attendanceGetControllerRouter from './controllers/attendanceGetController';
import sendAttendanceMessagePostControllerRouter from './controllers/sendAttendanceMessagePostController';
import checkMessageStatusGetControllerRouter from './controllers/checkMessageStatusGetController';
import projectsGetControllerRouter from './controllers/projectsGetController';
import profileUpdatePostControllerRouter from './controllers/profileUpdatePostController';
import taskPostControllerRouter from './controllers/taskPostController';
import commentControllerRouter from './controllers/commentController';
import notificationsControllerRouter from './controllers/notificationsController';
import audioUploadPostControllerRouter from './controllers/audioUploadPostController';
import channelMemberRolePostControllerRouter from './controllers/channelMemberRolePostController';
import { requireAuth, authErrorHandler } from './middleware/auth';

const app = express();
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(cors({ origin: '*' }));

// =============================================================================
// PUBLIC ROUTES (No authentication required)
// =============================================================================

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Convoe API Server is running',
    version: '1.0.0',
  });
});

// Webhook endpoints (called by external services with their own auth)
app.use('/getstream/webhooks', getstreamWebhooksPostControllerRouter);
app.use('/webhook', webhookPostControllerRouter);

// Auth endpoints - public (handles phone/SMS verification)
app.use('/auth', authControllerRouter);

// Join endpoint - public (user authenticates via Auth0 first, then calls /join)
app.use('/join', joinPostControllerRouter);

// =============================================================================
// PROTECTED ROUTES (Auth0 JWT validation required)
// =============================================================================

// Apply Auth0 JWT validation middleware to all routes below
app.use(requireAuth);

// User management
app.use('/channel-join', channelJoinPostControllerRouter);
app.use('/profile', profileUpdatePostControllerRouter);
app.use('/channel-member-role', channelMemberRolePostControllerRouter);

// Tasks
app.use('/task', taskPostControllerRouter);
app.use('/task', commentControllerRouter);

// Attendance
app.use('/attendance', attendancePostControllerRouter);
app.use('/attendance', attendanceGetControllerRouter);
app.use('/send-attendance-message', sendAttendanceMessagePostControllerRouter);
app.use('/check-message-status', checkMessageStatusGetControllerRouter);

// Projects
app.use('/projects', projectsGetControllerRouter);

// Notifications & Uploads
app.use('/notifications', notificationsControllerRouter);
app.use('/upload', audioUploadPostControllerRouter);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// Auth error handler (handles 401 Unauthorized errors)
app.use(authErrorHandler);

export { app };