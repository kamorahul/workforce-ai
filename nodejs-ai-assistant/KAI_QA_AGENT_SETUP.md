# 🤖 Kai Q&A Agent - Complete Setup Guide

## 📋 Overview

Your system now has **TWO separate AI agents** for Kai:

### Agent 1: Daily Summary Agent
- **ID**: `asst_IvTo37LM3gDUZ2LTXIgUBeS1`
- **Purpose**: Daily event summaries ONLY
- **Trigger**: Once per day when user opens app
- **Thread**: Temporary (no conversation memory)
- **Location**: `joinPostController.ts`

### Agent 2: Q&A Assistant (NEW)
- **ID**: `asst_SIcQ1bD17QezZbQIQEzuYMhg`
- **Purpose**: Answer questions, analyze images/PDFs, search tasks/messages
- **Trigger**: Every user message in kai channel
- **Thread**: Persistent (remembers conversation history)
- **Location**: `webhookPostController.ts`

---

## ✅ Implementation Complete

### Files Updated:

1. **`src/agents/types.ts`**
   - Added `usePersistentThread` parameter to `handleMessage()` interface

2. **`src/agents/openai/OpenAIAgent.ts`**
   - Added persistent thread logic for Q&A agent
   - Added conversation memory for images and documents
   - Added task context injection
   - Separated daily summary logic from Q&A logic

3. **`src/controllers/webhookPostController.ts`**
   - Updated to use Q&A agent ID: `asst_SIcQ1bD17QezZbQIQEzuYMhg`
   - Enabled persistent thread mode: `usePersistentThread: true`
   - Added attachment processing logs

---

## 🔧 Environment Variables

Add to your `.env` file:

```bash
# Daily Summary Agent (existing)
OPENAI_DAILY_SUMMARY_ASSISTANT_ID=asst_IvTo37LM3gDUZ2LTXIgUBeS1

# Q&A Agent (new)
OPENAI_QA_ASSISTANT_ID=asst_SIcQ1bD17QezZbQIQEzuYMhg

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here
```

---

## 🎯 How It Works

### Daily Summary Flow
```
User Opens App (Once/Day)
        ↓
joinPostController.ts
        ↓
Agent 1: Daily Summary (asst_IvTo...)
        ↓
Temporary Thread (No Memory)
        ↓
Fetches: Last 7 days messages + tasks
        ↓
Sends: "Good morning! Here's your summary..."
```

### Q&A Conversation Flow
```
User Sends Message in Kai
        ↓
webhookPostController.ts
        ↓
Agent 2: Q&A Assistant (asst_SIcQ...)
        ↓
Persistent Thread (Remembers Everything!)
        ↓
Loads: Task context + conversation history
        ↓
Processes: Text, Images, PDFs
        ↓
Responds: Smart answer with context
```

---

## 💬 Example Conversations

### 1. Simple Greeting
```
User: "hi"
Kai: "Hey! 👋 How can I help you today? I can:
• Answer questions about your tasks
• Search through team messages
• Analyze images or documents you upload
Just ask me anything!"
```

### 2. Task Query
```
User: "show me my tasks"
Kai: "Here are your current tasks:

**In Progress (2):**
• ⏳ Fix login bug - Due Nov 8
• ⏳ Write API docs - Due Nov 15

**To Do (5):**
• ○ Review PR #123 - Due Nov 10
• ○ Team meeting prep - Due Nov 12
..."
```

### 3. Image Analysis with Follow-up (REMEMBERS!)
```
User: [uploads screenshot of error]
User: "what's this error?"
Kai: "This is a 404 Not Found error. The application is trying to access '/api/users/123' but the endpoint doesn't exist..."

User: "how do I fix it?"  ← REMEMBERS the image!
Kai: "To fix the 404 error you're seeing:
1. Check if the API route '/api/users/123' is properly defined
2. Verify the user ID '123' exists in your database
3. Ensure your routing middleware is configured correctly..."
```

### 4. PDF Analysis with Follow-up (REMEMBERS!)
```
User: [uploads contract.pdf]
User: "summarize this contract"
Kai: "This is a software development contract with key terms:
• Project: Mobile app development
• Duration: 3 months
• Payment: $50,000 in 3 installments..."

User: "when is the first payment due?"  ← REMEMBERS the PDF!
Kai: "According to the contract I just analyzed, the first payment of $15,000 (30%) is due upon contract signing."
```

---

## 🧠 Conversation Memory Details

### What Q&A Agent Remembers:
✅ All previous text messages in the thread
✅ All uploaded images (can reference them later)
✅ All uploaded PDFs (can search content later)
✅ User's current tasks (auto-loaded each message)
✅ Conversation context across messages

### What Q&A Agent Does NOT Remember:
❌ Messages from other channels (only kai channel)
❌ Messages older than thread creation
❌ Daily summaries from Agent 1 (different agent)

### Thread Persistence:
- Thread is stored in MongoDB: `Thread` model
- Maps: `channelId` + `userId` → `openAiThreadId`
- Persists across app restarts
- Clears when channel is deleted

---

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTIONS                         │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
         ┌──────────▼─────────┐    ┌───▼──────────────────┐
         │   User Opens App   │    │ User Sends Message   │
         │   (Once per day)   │    │   "hi" / task Q /    │
         │                    │    │   uploads image/PDF  │
         └──────────┬─────────┘    └───┬──────────────────┘
                    │                   │
         ┌──────────▼──────────┐   ┌───▼──────────────────┐
         │ joinPostController  │   │ webhookPostController│
         │                     │   │                      │
         │ Agent 1 Init:       │   │ Agent 2 Init:        │
         │ asst_IvTo...        │   │ asst_SIcQ...         │
         │                     │   │                      │
         │ usePersistentThread │   │ usePersistentThread  │
         │ = false (default)   │   │ = true ✅            │
         └──────────┬──────────┘   └───┬──────────────────┘
                    │                   │
         ┌──────────▼──────────┐   ┌───▼──────────────────┐
         │ OpenAIAgent.ts      │   │ OpenAIAgent.ts       │
         │                     │   │                      │
         │ if (isKaiUser &&    │   │ if (isKaiUser &&     │
         │   !usePersistent)   │   │   usePersistent)     │
         │   → Temp Thread     │   │   → Persistent Thread│
         │                     │   │                      │
         │ Fetch:              │   │ Fetch:               │
         │ - 7 days messages   │   │ - User's tasks       │
         │ - User's tasks      │   │                      │
         │                     │   │ Remember:            │
         │ Send to OpenAI      │   │ - Previous messages  │
         │ Get: Daily summary  │   │ - Uploaded files     │
         │                     │   │                      │
         │                     │   │ Send to OpenAI       │
         │                     │   │ Get: Smart answer    │
         └──────────┬──────────┘   └───┬──────────────────┘
                    │                   │
         ┌──────────▼──────────┐   ┌───▼──────────────────┐
         │ OpenAIResponseHandler│  │ OpenAIResponseHandler│
         │                     │   │                      │
         │ - Stream response   │   │ - Stream response    │
         │ - Send to channel   │   │ - Send to channel    │
         │ - Mark as read      │   │ - Mark as read       │
         └──────────┬──────────┘   └───┬──────────────────┘
                    │                   │
         ┌──────────▼──────────┐   ┌───▼──────────────────┐
         │   Kai Channel       │   │   Kai Channel        │
         │   "Good morning..."  │   │   "Hey! How can I... │
         └─────────────────────┘   └──────────────────────┘
```

---

## 🧪 Testing Checklist

### Test 1: Greetings
- [ ] Send "hi" → Should get friendly greeting
- [ ] Send "hello" → Should respond warmly
- [ ] Send "thanks" → Should acknowledge

### Test 2: Task Queries
- [ ] Ask "show me my tasks" → Should list tasks
- [ ] Ask "what's due this week?" → Should filter by due date
- [ ] Ask "what tasks are in progress?" → Should filter by status

### Test 3: Image Analysis with Memory
- [ ] Upload an image of whiteboard
- [ ] Ask "summarize this" → Should describe image
- [ ] Ask "what's in the top right?" → Should remember and answer
- [ ] Ask "what color is the text?" → Should still remember

### Test 4: PDF Analysis with Memory
- [ ] Upload a PDF document
- [ ] Ask "summarize this document" → Should extract content
- [ ] Ask "what's on page 2?" → Should search PDF
- [ ] Ask "who signed this?" → Should still have context

### Test 5: Daily Summary (Separate Agent)
- [ ] Open app in morning → Should get daily summary
- [ ] Check that it's different from Q&A responses

---

## 🐛 Debugging

### Check Logs:
```bash
# Backend logs
cd /Users/luckysharan/Projects/workforce/workforce-ai/nodejs-ai-assistant
npm run dev

# Look for:
🤖 Using Q&A Assistant for kai channel: asst_SIcQ...
🧠 Using PERSISTENT thread for Q&A (remembers conversation + uploaded files)
📝 Thread ID: thread_xxxxx
📊 Loaded task context: X lines
📎 Processing attachment: filename (type: image, isImage: true)
✅ Message created in persistent thread
```

### Common Issues:

**Issue**: Kai doesn't remember previous messages
- **Check**: Is `usePersistentThread: true` in webhook call?
- **Check**: Is thread ID consistent across messages?

**Issue**: Image not analyzed
- **Check**: Is attachment.type === 'image' or mime_type starts with 'image/'?
- **Check**: Is image URL accessible?

**Issue**: PDF not processed
- **Check**: Is file extension .pdf or mime_type === 'application/pdf'?
- **Check**: Is File Search tool enabled in OpenAI assistant settings?

---

## 📝 Next Steps

1. ✅ **Deploy Backend**
   ```bash
   cd /Users/luckysharan/Projects/workforce/workforce-ai/nodejs-ai-assistant
   npm run build
   pm2 restart workforce-ai
   ```

2. ✅ **Test in App**
   - Open Kai chat
   - Send "hi"
   - Upload an image, ask about it, then ask a follow-up
   - Upload a PDF, ask about it, then ask a follow-up

3. ✅ **Monitor Performance**
   - Check response times
   - Verify conversation memory works
   - Check OpenAI usage/costs

4. ✅ **Optimize System Instructions**
   - Adjust tone based on user feedback
   - Add more example interactions
   - Fine-tune response format

---

## 🎉 Summary

You now have a **smart Q&A assistant** that:
- ✅ Responds to greetings naturally
- ✅ Answers task-related questions
- ✅ Analyzes uploaded images
- ✅ Reads and searches PDFs
- ✅ **Remembers entire conversation history**
- ✅ **Can answer follow-up questions about uploaded files**
- ✅ Maintains context across multiple messages

The daily summary agent (Agent 1) continues to work independently, providing morning summaries once per day.

---

**Created**: November 6, 2025
**Agent ID**: asst_SIcQ1bD17QezZbQIQEzuYMhg
**Status**: ✅ Fully Implemented & Ready to Test

