# Task and Comment API with GetStream Activity Feeds Integration

This document explains the enhanced task API with GetStream Activity Feeds integration for real-time comments.

## Overview

The backend now supports a complete task management system with:
- Task creation, updates, and completion
- **Dual storage**: Comments stored in both MongoDB and GetStream Activity Feeds
- Real-time comment updates via GetStream
- Comment reactions and advanced features
- Task details with integrated comments
- Full CRUD operations for comments

## Architecture

### Dual Storage Strategy
- **Primary**: MongoDB for reliable data persistence
- **Secondary**: GetStream Activity Feeds for real-time features
- **Sync**: Comments are stored in both systems for redundancy
- **Fallback**: If GetStream fails, system falls back to database-only mode

### GetStream Activity Feeds Integration
Based on the [GetStream Activity Feeds documentation](https://getstream.io/activity-feeds/docs/node/comments/), the system provides:
- ✅ Real-time comment updates
- ✅ Comment reactions (like, dislike, etc.)
- ✅ Comment threading capabilities
- ✅ Advanced comment features

## API Endpoints

### Task Management

#### 1. Create Task

**POST** `/task`

Creates a new task.

**Request Body:**
```json
{
  "name": "Task Name",
  "assignee": ["user1", "user2"],
  "priority": "high",
  "completionDate": "2024-01-15",
  "channelId": "channel123",
  "description": "Task description",
  "subtasks": [
    {
      "name": "Subtask 1",
      "completed": false
    }
  ],
  "createdBy": "user1"
}
```

**Response:**
```json
{
  "status": "success",
  "task": {
    "_id": "task_id",
    "name": "Task Name",
    "assignee": ["user1", "user2"],
    "priority": "high",
    "completionDate": "2024-01-15T00:00:00.000Z",
    "channelId": "channel123",
    "description": "Task description",
    "subtasks": [...],
    "createdBy": "user1",
    "completed": false,
    "createdAt": "2024-01-10T12:00:00.000Z",
    "updatedAt": "2024-01-10T12:00:00.000Z"
  }
}
```

#### 2. Get All Tasks

**GET** `/task?assignee=user1&channelId=channel123`

**Query Parameters:**
- `assignee` (optional): Filter by assignee
- `channelId` (optional): Filter by channel
- `createdBy` (optional): Filter by creator

**Response:**
```json
{
  "status": "success",
  "tasks": [
    {
      "_id": "task_id",
      "name": "Task Name",
      "assignee": ["user1", "user2"],
      "priority": "high",
      "completionDate": "2024-01-15T00:00:00.000Z",
      "channelId": "channel123",
      "description": "Task description",
      "subtasks": [...],
      "createdBy": "user1",
      "completed": false,
      "createdAt": "2024-01-10T12:00:00.000Z",
      "updatedAt": "2024-01-10T12:00:00.000Z"
    }
  ]
}
```

#### 3. Get Task Details with Comments

**GET** `/task/:taskId`

**Response:**
```json
{
  "status": "success",
  "task": {
    "_id": "task_id",
    "name": "Task Name",
    "assignee": ["user1", "user2"],
    "priority": "high",
    "completionDate": "2024-01-15T00:00:00.000Z",
    "channelId": "channel123",
    "description": "Task description",
    "subtasks": [...],
    "createdBy": "user1",
    "completed": false,
    "createdAt": "2024-01-10T12:00:00.000Z",
    "updatedAt": "2024-01-10T12:00:00.000Z"
  },
  "comments": [
    {
      "_id": "comment_id",
      "taskId": "task_id",
      "userId": "user1",
      "message": "This is a comment",
      "getstreamCommentId": "getstream_comment_id",
      "createdAt": "2024-01-10T12:00:00.000Z",
      "updatedAt": "2024-01-10T12:00:00.000Z"
    }
  ]
}
```

#### 4. Update Task

**PUT** `/task/:taskId`

**Request Body:**
```json
{
  "name": "Updated Task Name",
  "assignee": ["user1", "user3"],
  "priority": "medium",
  "completionDate": "2024-01-20",
  "channelId": "channel123",
  "description": "Updated description",
  "subtasks": [...],
  "completed": true
}
```

#### 5. Mark Task as Complete

**PATCH** `/task/:taskId/complete`

**Response:**
```json
{
  "status": "success",
  "task": {
    "_id": "task_id",
    "completed": true,
    "updatedAt": "2024-01-10T12:00:00.000Z"
  }
}
```

### Comment Management

#### 1. Post Comment on Task

**POST** `/task/:taskId/comments`

**Request Body:**
```json
{
  "userId": "user1",
  "message": "This is a comment on the task"
}
```

**Response:**
```json
{
  "status": "success",
  "comment": {
    "_id": "comment_id",
    "taskId": "task_id",
    "userId": "user1",
    "message": "This is a comment on the task",
    "getstreamCommentId": "getstream_comment_id",
    "createdAt": "2024-01-10T12:00:00.000Z",
    "updatedAt": "2024-01-10T12:00:00.000Z",
    "getstreamComment": {
      "id": "getstream_comment_id",
      "comment": "This is a comment on the task",
      "user_id": "user1",
      "created_at": "2024-01-10T12:00:00.000Z",
      "updated_at": "2024-01-10T12:00:00.000Z"
    }
  }
}
```

#### 2. Get Comments for Task

**GET** `/task/:taskId/comments?userId=user1`

**Query Parameters:**
- `userId` (optional): User ID for GetStream authentication

**Response:**
```json
{
  "status": "success",
  "comments": [
    {
      "_id": "comment_id",
      "taskId": "task_id",
      "userId": "user1",
      "message": "This is a comment",
      "getstreamCommentId": "getstream_comment_id",
      "createdAt": "2024-01-10T12:00:00.000Z",
      "updatedAt": "2024-01-10T12:00:00.000Z"
    }
  ],
  "source": "getstream" // or "database" if fallback
}
```

#### 3. Update Comment

**PUT** `/task/:taskId/comments/:commentId`

**Request Body:**
```json
{
  "message": "Updated comment message",
  "userId": "user1"
}
```

**Response:**
```json
{
  "status": "success",
  "comment": {
    "_id": "comment_id",
    "taskId": "task_id",
    "userId": "user1",
    "message": "Updated comment message",
    "getstreamCommentId": "getstream_comment_id",
    "createdAt": "2024-01-10T12:00:00.000Z",
    "updatedAt": "2024-01-10T12:30:00.000Z",
    "getstreamComment": {
      "id": "getstream_comment_id",
      "comment": "Updated comment message",
      "user_id": "user1",
      "created_at": "2024-01-10T12:00:00.000Z",
      "updated_at": "2024-01-10T12:30:00.000Z"
    }
  }
}
```

#### 4. Delete Comment

**DELETE** `/task/:taskId/comments/:commentId`

**Request Body:**
```json
{
  "userId": "user1"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Comment deleted successfully"
}
```

### Comment Reactions

#### 1. Add Reaction to Comment

**POST** `/task/:taskId/comments/:commentId/reactions`

**Request Body:**
```json
{
  "userId": "user1",
  "type": "like"
}
```

**Response:**
```json
{
  "status": "success",
  "reaction": {
    "id": "reaction_id",
    "type": "like",
    "user_id": "user1"
  }
}
```

#### 2. Remove Reaction from Comment

**DELETE** `/task/:taskId/comments/:commentId/reactions`

**Request Body:**
```json
{
  "userId": "user1",
  "type": "like"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Reaction removed successfully",
  "success": true
}
```

## Data Models

### Task Model
```typescript
interface ITask {
  _id: string;
  name: string;
  assignee: string[];
  priority: 'low' | 'medium' | 'high';
  completionDate: Date;
  channelId: string;
  description?: string;
  subtasks: ISubtask[];
  createdBy: string;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ISubtask {
  name: string;
  completed: boolean;
}
```

### Comment Model
```typescript
interface IComment {
  _id: string;
  taskId: string;
  userId: string;
  message: string;
  getstreamCommentId?: string; // GetStream comment ID for sync
  createdAt: Date;
  updatedAt: Date;
}
```

## Frontend Integration Examples

### Create Task with JavaScript

```javascript
const createTask = async (taskData) => {
  const response = await fetch('/task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(taskData),
  });
  
  return response.json();
};

// Usage
const taskData = {
  name: 'New Task',
  assignee: ['user1', 'user2'],
  priority: 'high',
  completionDate: '2024-01-15',
  channelId: 'channel123',
  description: 'Task description',
  createdBy: 'user1',
};

const result = await createTask(taskData);
console.log('Task created:', result.task);
```

### Post Comment with GetStream Integration

```javascript
const postComment = async (taskId, userId, message) => {
  const response = await fetch(`/task/${taskId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, message }),
  });
  
  return response.json();
};

// Usage
const comment = await postComment('task_id', 'user1', 'Great progress on this task!');
console.log('Comment posted:', comment.comment);
console.log('GetStream comment ID:', comment.comment.getstreamCommentId);
```

### Get Comments with Real-time Support

```javascript
const getComments = async (taskId, userId) => {
  const response = await fetch(`/task/${taskId}/comments?userId=${userId}`);
  return response.json();
};

// Usage
const commentsData = await getComments('task_id', 'user1');
console.log('Comments:', commentsData.comments);
console.log('Source:', commentsData.source); // 'getstream' or 'database'
```

### Add Reaction to Comment

```javascript
const addReaction = async (taskId, commentId, userId, type) => {
  const response = await fetch(`/task/${taskId}/comments/${commentId}/reactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, type }),
  });
  
  return response.json();
};

// Usage
const reaction = await addReaction('task_id', 'comment_id', 'user1', 'like');
console.log('Reaction added:', reaction.reaction);
```

### Get Task Details with Comments

```javascript
const getTaskDetails = async (taskId) => {
  const response = await fetch(`/task/${taskId}`);
  return response.json();
};

// Usage
const taskDetails = await getTaskDetails('task_id');
console.log('Task:', taskDetails.task);
console.log('Comments:', taskDetails.comments);
```

## Environment Variables

Make sure these environment variables are set:
- `STREAM_API_KEY`: GetStream API key for Activity Feeds
- `MONGODB_URI`: MongoDB connection string
- `STREAM_API_SECRET`: GetStream API secret (for server-side operations)

## Error Handling

The API returns appropriate error responses:

```json
{
  "error": "Missing required fields: taskId, userId, or message"
}
```

```json
{
  "error": "Task not found"
}
```

```json
{
  "error": "Comment not found"
}
```

## Notes

1. **Dual Storage**: Comments are stored in both MongoDB and GetStream for reliability
2. **Fallback Strategy**: If GetStream fails, the system falls back to database-only mode
3. **Real-time Features**: GetStream provides real-time comment updates and reactions
4. **User Authentication**: GetStream operations require user tokens for authentication
5. **Data Consistency**: Both systems are kept in sync for data integrity
6. **Error Resilience**: System continues to work even if GetStream is unavailable

## GetStream Activity Feeds Features

Based on the [GetStream Activity Feeds documentation](https://getstream.io/activity-feeds/docs/node/comments/), the integration provides:

### Core Features
- ✅ Real-time comment updates
- ✅ Comment reactions (like, dislike, etc.)
- ✅ Comment threading (replies to comments)
- ✅ Comment voting and ranking
- ✅ Comment bookmarks and pins

### Advanced Features
- ✅ Comment search and filtering
- ✅ Comment moderation capabilities
- ✅ Comment notifications
- ✅ Comment analytics

### Implementation Details
- Uses `@stream-io/feeds-client` package
- Implements proper user authentication
- Handles connection management
- Provides fallback mechanisms
- Maintains data consistency between systems

This integration provides a robust, real-time commenting system that combines the reliability of MongoDB with the advanced features of GetStream Activity Feeds. 