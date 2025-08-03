# Assistant Integration Setup Guide

This guide helps you set up and debug the OpenAI Assistant integration with GetStream.

## Prerequisites

1. **OpenAI API Key**: You need a valid OpenAI API key with access to the Assistants API
2. **OpenAI Assistant**: You need to create an assistant in your OpenAI account
3. **GetStream Account**: You need GetStream API keys
4. **Node.js**: Version 16 or higher

## Step 1: Environment Setup

Create a `.env` file in the root directory:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_ASSISTANT_ID=asst_your_assistant_id_here

# GetStream Configuration
STREAM_API_KEY=your_stream_api_key_here
STREAM_API_SECRET=your_stream_api_secret_here

# MongoDB Configuration
MONGODB_URI=your_mongodb_connection_string_here

# Server Configuration
PORT=3000
NODE_ENV=development
```

## Step 2: Create OpenAI Assistant

1. Go to [OpenAI Platform](https://platform.openai.com/assistants)
2. Click "Create" to create a new assistant
3. Configure the assistant with:
   - **Name**: Task Assistant
   - **Instructions**: 
     ```
     You are a helpful assistant that extracts structured information from user messages.

     ## Extraction Rules:
     - Try to understand the conversation and find the expected tasks or calendar events
     - Extract dates, times, and action items from user messages

     ## Output Format (always follow this):
     **Upcoming Events**
     - [List events here with time/date and subject]

     **Tasks to Complete**
     - [List tasks here with what needs to be done and any deadlines]

     ## Requirements:
     - Never return "null" or leave sections empty. If nothing is found, say: "You are all good for the day"
     - Keep all tasks and events user-focused unless clearly about someone else
     - Always respond in the exact format specified above
     ```
   - **Model**: GPT-4 or GPT-3.5-turbo
4. Copy the assistant ID (starts with `asst_`)
5. Update your `.env` file with the assistant ID

## Step 3: Install Dependencies

```bash
npm install
# or
yarn install
```

## Step 4: Test the Setup

Run the test script to verify everything is working:

```bash
node test-assistant.js
```

This will:
- Check environment variables
- Test the assistant ID
- Test the webhook endpoint

## Step 5: Start the Server

```bash
npm start
# or
yarn start
```

## Step 6: Test with Curl

Test the webhook endpoint:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "I have a meeting tomorrow at 2pm with the marketing team",
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

## Debugging Common Issues

### Issue 1: Assistant Not Found
**Error**: `Assistant not found`
**Solution**:
1. Verify the assistant ID in your `.env` file
2. Check if the assistant exists in your OpenAI account
3. Ensure your API key has access to the assistant

### Issue 2: API Key Issues
**Error**: `Invalid API key`
**Solution**:
1. Verify your OpenAI API key is correct
2. Check if the API key has the necessary permissions
3. Ensure you're using the correct organization

### Issue 3: GetStream Connection Issues
**Error**: `Connection failed`
**Solution**:
1. Verify your GetStream API keys
2. Check network connectivity
3. Ensure the channel exists in GetStream

### Issue 4: Message Not Being Processed
**Symptoms**: No response from assistant
**Debugging**:
1. Check the server logs for errors
2. Verify the webhook is being called
3. Check if the user/channel condition is being met
4. Look for errors in the assistant initialization

## Monitoring and Logs

### Enable Debug Logging

Add this to your server startup for more detailed logs:

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

## Integration with GetStream

The assistant is configured to work with GetStream channels that start with "kai". Messages in these channels will be processed by the assistant.

### Channel Naming Convention
- Channels starting with "kai" will be processed by the assistant
- Other channels will be ignored
- Users with ID "kai" will also be ignored

### Message Flow
1. Webhook receives message from GetStream
2. Checks if channel starts with "kai"
3. Initializes OpenAI assistant
4. Processes message through assistant
5. Sends response back to GetStream channel

## Testing Different Scenarios

### Test 1: Basic Task Message
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "I need to complete the quarterly report by Friday",
      "attachments": []
    },
    "user": {
      "id": "test_user",
      "name": "Test User"
    },
    "channel": {
      "id": "kai_tasks",
      "type": "messaging"
    }
  }'
```

### Test 2: Event Message
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "Team meeting scheduled for tomorrow at 10am",
      "attachments": []
    },
    "user": {
      "id": "test_user",
      "name": "Test User"
    },
    "channel": {
      "id": "kai_events",
      "type": "messaging"
    }
  }'
```

### Test 3: Non-Kai Channel (Should Skip)
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

## Next Steps

1. **Test the integration** with the provided curl commands
2. **Monitor logs** for any issues
3. **Verify assistant responses** are being sent to the channel
4. **Integrate with your frontend** to send real messages
5. **Customize the assistant** instructions for your specific use case

## Support

If you encounter issues:
1. Check the debugging guide in `DEBUG_ASSISTANT.md`
2. Review the server logs for error messages
3. Test with the provided curl commands
4. Verify all environment variables are set correctly

This setup guide should help you get the assistant integration working properly. 