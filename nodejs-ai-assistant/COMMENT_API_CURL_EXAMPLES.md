# Comment API CURL Examples

This document provides comprehensive CURL examples for all comment-related API endpoints.

## Base URL
```
http://localhost:3000
```

## API Endpoints Overview

1. **POST** `/task/:taskId/comments` - Create a new comment
2. **GET** `/task/:taskId/comments` - Get all comments for a task
3. **PUT** `/task/:taskId/comments/:commentId` - Update a comment
4. **DELETE** `/task/:taskId/comments/:commentId` - Delete a comment
5. **POST** `/task/:taskId/comments/:commentId/reactions` - Add reaction to comment
6. **DELETE** `/task/:taskId/comments/:commentId/reactions` - Remove reaction from comment

---

## 1. Create a New Comment

### CURL Request
```bash
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "message": "This is a great task! I will start working on it tomorrow."
  }'
```

### Expected Response
```json
{
  "status": "success",
  "comment": {
    "_id": "64f8a1b2c3d4e5f6a7b8c9d1",
    "taskId": "64f8a1b2c3d4e5f6a7b8c9d0",
    "userId": "user123",
    "message": "This is a great task! I will start working on it tomorrow.",
    "getstreamCommentId": "gs_comment_123456",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "getstreamComment": {
      "id": "gs_comment_123456",
      "comment": "This is a great task! I will start working on it tomorrow.",
      "user_id": "user123",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z",
      "custom": {
        "commentId": "64f8a1b2c3d4e5f6a7b8c9d1",
        "taskId": "64f8a1b2c3d4e5f6a7b8c9d0"
      }
    }
  }
}
```

### Error Response (Task Not Found)
```json
{
  "error": "Task not found"
}
```

### Error Response (Missing Fields)
```json
{
  "error": "Missing required fields: taskId, userId, or message"
}
```

---

## 2. Get All Comments for a Task

### CURL Request (With User ID - GetStream)
```bash
curl -X GET "http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments?userId=user123" \
  -H "Content-Type: application/json"
```

### CURL Request (Without User ID - Database Only)
```bash
curl -X GET "http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments" \
  -H "Content-Type: application/json"
```

### Expected Response (GetStream Source)
```json
{
  "status": "success",
  "source": "getstream",
  "comments": [
    {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d1",
      "taskId": "64f8a1b2c3d4e5f6a7b8c9d0",
      "userId": "user123",
      "message": "This is a great task! I will start working on it tomorrow.",
      "getstreamCommentId": "gs_comment_123456",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d2",
      "taskId": "64f8a1b2c3d4e5f6a7b8c9d0",
      "userId": "user456",
      "message": "I can help with this task as well.",
      "getstreamCommentId": "gs_comment_123457",
      "createdAt": "2024-01-15T11:00:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  ]
}
```

### Expected Response (Database Source)
```json
{
  "status": "success",
  "source": "database",
  "comments": [
    {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d1",
      "taskId": "64f8a1b2c3d4e5f6a7b8c9d0",
      "userId": "user123",
      "message": "This is a great task! I will start working on it tomorrow.",
      "getstreamCommentId": null,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Error Response (Task Not Found)
```json
{
  "error": "Task not found"
}
```

---

## 3. Update a Comment

### CURL Request
```bash
curl -X PUT http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1 \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "message": "Updated: This is a great task! I will start working on it tomorrow and finish by Friday."
  }'
```

### Expected Response
```json
{
  "status": "success",
  "comment": {
    "_id": "64f8a1b2c3d4e5f6a7b8c9d1",
    "taskId": "64f8a1b2c3d4e5f6a7b8c9d0",
    "userId": "user123",
    "message": "Updated: This is a great task! I will start working on it tomorrow and finish by Friday.",
    "getstreamCommentId": "gs_comment_123456",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T12:00:00.000Z",
    "getstreamComment": {
      "id": "gs_comment_123456",
      "comment": "Updated: This is a great task! I will start working on it tomorrow and finish by Friday.",
      "user_id": "user123",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T12:00:00.000Z",
      "custom": {
        "edited": true
      }
    }
  }
}
```

### Error Response (Comment Not Found)
```json
{
  "error": "Comment not found"
}
```

### Error Response (Missing Fields)
```json
{
  "error": "Missing required fields"
}
```

---

## 4. Delete a Comment

### CURL Request
```bash
curl -X DELETE http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1 \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123"
  }'
```

### Expected Response
```json
{
  "status": "success",
  "message": "Comment deleted successfully"
}
```

### Error Response (Comment Not Found)
```json
{
  "error": "Comment not found"
}
```

### Error Response (Missing Parameters)
```json
{
  "error": "Missing required parameters"
}
```

---

## 5. Add Reaction to Comment

### CURL Request
```bash
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1/reactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "type": "like"
  }'
```

### Expected Response
```json
{
  "status": "success",
  "reaction": {
    "id": "gs_reaction_123456",
    "type": "like",
    "user_id": "user123",
    "created_at": "2024-01-15T12:30:00.000Z"
  }
}
```

### Other Reaction Types
```bash
# Thumbs up
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1/reactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "type": "thumbs_up"
  }'

# Heart
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1/reactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "type": "heart"
  }'

# Clap
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1/reactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "type": "clap"
  }'
```

### Error Response (Missing Fields)
```json
{
  "error": "Missing required fields"
}
```

---

## 6. Remove Reaction from Comment

### CURL Request
```bash
curl -X DELETE http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1/reactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "type": "like"
  }'
```

### Expected Response
```json
{
  "status": "success",
  "message": "Reaction removed successfully",
  "success": true
}
```

### Error Response (Missing Fields)
```json
{
  "error": "Missing required fields"
}
```

---

## Complete Example Workflow

Here's a complete workflow showing how to use all the comment APIs:

### Step 1: Create a Task (if not exists)
```bash
curl -X POST http://localhost:3000/task \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Complete Project Documentation",
    "description": "Write comprehensive documentation for the new API",
    "priority": "high",
    "assignee": "user123",
    "completionDate": "2024-01-20",
    "channelId": "project_channel_123",
    "createdBy": "user456"
  }'
```

### Step 2: Add Comments to the Task
```bash
# First comment
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "message": "I will start working on the documentation tomorrow morning."
  }'

# Second comment
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user456",
    "message": "Great! I can help review the documentation once it is ready."
  }'
```

### Step 3: Get All Comments
```bash
curl -X GET "http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments?userId=user123" \
  -H "Content-Type: application/json"
```

### Step 4: Add Reactions
```bash
# Like the first comment
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1/reactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user456",
    "type": "like"
  }'
```

### Step 5: Update a Comment
```bash
curl -X PUT http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1 \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "message": "Updated: I will start working on the documentation tomorrow morning and aim to complete it by Friday."
  }'
```

### Step 6: Remove Reaction
```bash
curl -X DELETE http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d1/reactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user456",
    "type": "like"
  }'
```

### Step 7: Delete a Comment
```bash
curl -X DELETE http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments/64f8a1b2c3d4e5f6a7b8c9d2 \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user456"
  }'
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- **200** - Success
- **201** - Created (for new comments)
- **400** - Bad Request (missing required fields)
- **404** - Not Found (task or comment not found)
- **500** - Internal Server Error

## Notes

1. **Dual Storage**: Comments are stored in both MongoDB and GetStream Activity Feeds
2. **Fallback**: If GetStream fails, the system falls back to database-only operations
3. **User Tokens**: The system generates temporary user tokens for GetStream operations
4. **Reactions**: Only available for comments that have been synced to GetStream
5. **Task Validation**: All comment operations verify that the task exists before proceeding

## Testing with Different Scenarios

### Test with Non-Existent Task
```bash
curl -X POST http://localhost:3000/task/nonexistent/comments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "message": "This should fail"
  }'
```

### Test with Missing Fields
```bash
curl -X POST http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123"
  }'
```

### Test GetStream Fallback
```bash
# This will fall back to database if GetStream is not available
curl -X GET "http://localhost:3000/task/64f8a1b2c3d4e5f6a7b8c9d0/comments" \
  -H "Content-Type: application/json"
```

These CURL examples provide comprehensive coverage of all comment API functionality and can be used for testing, development, and integration purposes. 