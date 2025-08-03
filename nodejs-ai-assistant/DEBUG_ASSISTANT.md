# Assistant Debugging Guide

This document helps debug issues with the OpenAI Assistant integration in the webhook controller.

## Current Issues Identified

### 1. **Webhook Response Handling**
**Issue**: The webhook controller doesn't properly handle responses for non-'kai' cases.

**Problem in `webhookPostController.ts`**:
```typescript
// Lines 18-22: Early return without proper response
if(user.id === 'kai' || channel.id.indexOf('kai') !== 0) {
  res.json(req.body);
  return;
}
```

**Fix**: Add proper response handling:
```typescript
if(user.id === 'kai' || channel.id.indexOf('kai') !== 0) {
  res.json(req.body);
  return;
}
```

### 2. **Assistant Initialization**
**Issue**: The assistant ID is hardcoded and may not exist.

**Problem in `webhookPostController.ts`**:
```typescript
await agent.init("asst_Q8vD9YOGcO3es62kFjeVZI5L");
```

**Fix**: Use environment variable:
```typescript
const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_Q8vD9YOGcYOGcO3es62kFjeVZI5L";
await agent.init(assistantId);
```

### 3. **Message Handling Logic**
**Issue**: The logic for handling attachments and text messages is flawed.

**Problem in `webhookPostController.ts`**:
```typescript
if(message.attachments.length > 0) {
  agent.handleMessage(
    `${message.text}: ${message.attachments[0].toString()}`
  );
  return; // This prevents text-only messages from being processed
}
```

**Fix**: Improve message handling:
```typescript
let messageText = message.text || '';
if(message.attachments && message.attachments.length > 0) {
  messageText += `: ${message.attachments[0].toString()}`;
}
await agent.handleMessage(messageText);
```

### 4. **Error Handling**
**Issue**: No error handling in the webhook controller.

**Fix**: Add comprehensive error handling:
```typescript
try {
  // ... existing code
} catch (error) {
  console.error('Webhook processing error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
```

## Debugging Steps

### Step 1: Check Environment Variables
```bash
# Verify these environment variables are set
echo $OPENAI_API_KEY
echo $OPENAI_ASSISTANT_ID
echo $STREAM_API_KEY
echo $STREAM_API_SECRET
```

### Step 2: Test Assistant ID
```bash
# Test if the assistant exists
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  "https://api.openai.com/v1/assistants/asst_Q8vD9YOGcO3es62kFjeVZI5L"
```

### Step 3: Check Webhook Logs
Add detailed logging to the webhook controller:

```typescript
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("=== Webhook Debug ===");
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));
    
    const {message, user, channel} = req.body;
    
    if (!message || !user || !channel) {
      console.error("Missing required fields");
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    console.log("User:", user);
    console.log("Channel:", channel);
    console.log("Message:", message);

    const agent = await createAgent(user as User, channel.type, channel.id);
    console.log("Agent created successfully");

    if(user.id === 'kai' || channel.id.indexOf('kai') !== 0) {
      console.log("Skipping assistant processing");
      res.json(req.body);
      return;
    }

    const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_Q8vD9YOGcO3es62kFjeVZI5L";
    console.log("Initializing assistant with ID:", assistantId);
    
    await agent.init(assistantId);
    console.log("Assistant initialized successfully");

    let messageText = message.text || '';
    if(message.attachments && message.attachments.length > 0) {
      messageText += `: ${message.attachments[0].toString()}`;
    }
    
    console.log("Processing message:", messageText);
    await agent.handleMessage(messageText);
    console.log("Message processed successfully");

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});
```

### Step 4: Test Assistant Response
Add logging to the OpenAIAgent:

```typescript
public handleMessage = async (e: string) => {
  console.log("=== Assistant Debug ===");
  console.log("Message received:", e);
  
  if (!this.openai || !this.openAiThread || !this.assistant) {
    console.error('OpenAI not initialized');
    return;
  }

  if (!e) {
    console.log('Skip handling empty message');
    return;
  }

  this.lastInteractionTs = Date.now();
  console.log("Creating assistant message...");

  await this.openai.beta.threads.messages.create(this.openAiThread.id, {
    role: "assistant",
    content: `You are a helpful assistant that extracts structured information from user messages.

              ## Extraction Rules:

              - try to understand the conversation and find the expected tasks or calender events

              ## Output Format (always follow this):

              **Upcoming Events**
              - [List events here with time/date and subject]

              **Tasks to Complete**
              - [List tasks here with what needs to be done and any deadlines]

              ## Requirements:
              - Never return "null" or leave sections empty. If nothing is found, say: "You are all good for the day" .
              - Keep all tasks and events user-focused unless clearly about someone else.
    `,
  });

  console.log("Creating user message...");
  await this.openai.beta.threads.messages.create(this.openAiThread.id, {
    role: 'user',
    content: e,
  });

  console.log("Starting assistant run...");
  try {
    const run = this.openai.beta.threads.runs.stream(this.openAiThread.id, {
      assistant_id: this.assistant.id,
    });

    const handler = new OpenAIResponseHandler(
      this.openai,
      this.openAiThread,
      run,
      this.chatClient,
      this.channel,
      this.user,
    );
    
    console.log("Starting response handler...");
    void handler.run();
    this.handlers.push(handler);
    console.log("Response handler started successfully");
  } catch (error) {
    console.error("Error in handleMessage:", error);
  }
};
```

## Common Issues and Solutions

### Issue 1: Assistant Not Found
**Error**: `Assistant not found`
**Solution**: 
1. Check if the assistant ID exists in your OpenAI account
2. Verify the assistant ID in environment variables
3. Create a new assistant if needed

### Issue 2: API Key Issues
**Error**: `Invalid API key`
**Solution**:
1. Verify OPENAI_API_KEY is set correctly
2. Check if the API key has the necessary permissions
3. Ensure the API key is for the correct organization

### Issue 3: Stream Chat Connection Issues
**Error**: `Connection failed`
**Solution**:
1. Verify STREAM_API_KEY and STREAM_API_SECRET
2. Check network connectivity
3. Ensure the channel exists

### Issue 4: Message Not Being Processed
**Symptoms**: No response from assistant
**Debugging**:
1. Check if the user/channel condition is being met
2. Verify the message text is not empty
3. Check if the assistant is properly initialized
4. Look for errors in the response handler

## Testing the Integration

### Test 1: Basic Message
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "I have a meeting tomorrow at 2pm",
      "attachments": []
    },
    "user": {
      "id": "test_user",
      "name": "Test User"
    },
    "channel": {
      "id": "kai_test_channel",
      "type": "messaging"
    }
  }'
```

### Test 2: Message with Attachment
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "Please review this document",
      "attachments": ["document.pdf"]
    },
    "user": {
      "id": "test_user",
      "name": "Test User"
    },
    "channel": {
      "id": "kai_test_channel",
      "type": "messaging"
    }
  }'
```

### Test 3: Non-Kai Channel (Should Skip Processing)
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "This should not be processed",
      "attachments": []
    },
    "user": {
      "id": "test_user",
      "name": "Test User"
    },
    "channel": {
      "id": "other_channel",
      "type": "messaging"
    }
  }'
```

## Environment Variables Checklist

Make sure these are set in your `.env` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_ASSISTANT_ID=asst_your_assistant_id_here

# GetStream Configuration
STREAM_API_KEY=your_stream_api_key_here
STREAM_API_SECRET=your_stream_api_secret_here

# MongoDB Configuration
MONGODB_URI=your_mongodb_connection_string_here
```

## Monitoring and Logs

### Enable Debug Logging
Add this to your server startup:

```typescript
// In server.ts or index.ts
if (process.env.NODE_ENV === 'development') {
  console.log('Debug mode enabled');
  process.env.DEBUG = 'stream-chat:*';
}
```

### Check Logs
```bash
# Watch logs in real-time
tail -f logs/app.log

# Check for errors
grep -i error logs/app.log

# Check for assistant-related logs
grep -i assistant logs/app.log
```

## Next Steps

1. **Implement the fixes** above
2. **Test with the provided curl commands**
3. **Monitor logs** for any remaining issues
4. **Verify assistant responses** are being sent to the channel
5. **Test with real GetStream messages** from your frontend

This debugging guide should help identify and resolve the issues with the assistant integration. 