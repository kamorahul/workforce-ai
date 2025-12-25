import OpenAI from 'openai';
import { OpenAIResponseHandler } from './OpenAIResponseHandler';
import type { AIAgent } from '../types';
import type { Channel, StreamChat } from 'stream-chat';
import {User} from "../createAgent";
import { Thread } from '../../models/Thread';
import { Task } from '../../models/Task';

export class OpenAIAgent implements AIAgent {
  private openai?: OpenAI;
  private assistant?: OpenAI.Beta.Assistants.Assistant;
  private openAiThread?: OpenAI.Beta.Threads.Thread;
  private lastInteractionTs = Date.now();

  private handlers: OpenAIResponseHandler[] = [];

  constructor(
    readonly chatClient: StreamChat,
    readonly channel: Channel,
    readonly user: User
  ) {}

  dispose = async () => {
    await this.chatClient.disconnectUser();

    this.handlers.forEach((handler) => handler.dispose());
    this.handlers = [];
  };

  getLastInteraction = (): number => this.lastInteractionTs;

  init = async (agentId: string) => {
    console.log("=== Assistant Init Debug ===");
    console.log("Initializing assistant with ID:", agentId);
    
    const apiKey = process.env.OPENAI_API_KEY as string | undefined;
    if (!apiKey) {
      console.error('OpenAI API key is missing');
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({ apiKey });
  
    this.assistant = await this.openai.beta.assistants.retrieve(agentId);
    
    // Check if thread already exists for this channel and user
    const existingThread = await Thread.findOne({ 
      channelId: this.channel.id, 
      userId: this.user.id 
    });
    
    if (existingThread) {
      this.openAiThread = await this.openai.beta.threads.retrieve(existingThread.openAiThreadId);
      console.log("Using existing thread:", existingThread.openAiThreadId);
    } else {
      // Create new thread
      this.openAiThread = await this.openai.beta.threads.create();
      
      // Save thread mapping to MongoDB
      const threadRecord = new Thread({
        channelId: this.channel.id,
        openAiThreadId: this.openAiThread.id,
        userId: this.user.id
      });
      await threadRecord.save();
      console.log("Created new thread and saved to MongoDB:", this.openAiThread.id);
    }
  };

  public handleMessage = async (e: string, messageId?: string, attachments?: any[], usePersistentThread: boolean = false) => {
    if (!this.openai || !this.openAiThread || !this.assistant) {
      console.error('OpenAI not initialized');
      return;
    }

    if (!e) {
      return;
    }

    this.lastInteractionTs = Date.now();

    // Check if this is a kai user/channel to use different system prompt
    const isKaiUser = this.user.id === 'kai' || this.channel.id?.indexOf('kai') === 0;
    
    let threadToUse = this.openAiThread;
    let additionalInstructions = '';
    
    if (isKaiUser && !usePersistentThread) {
      // FOR DAILY SUMMARY AGENT: Create a temporary thread with ONLY recent GetStream conversations
      // This ensures the AI only sees fresh data, not old accumulated messages
      console.log('📋 Using TEMPORARY thread for daily summary (no conversation memory)');
      
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // Step 1: Get all user's channels
        const channels = await this.chatClient.queryChannels({
          members: { $in: [this.user.id] },
        });
        
        let recentMessages: string[] = [];
        
        // Step 2: Fetch recent messages from each channel
        for (const channel of channels) {
          // Skip the kai channel itself (don't analyze Kai's own summaries!)
          if (channel.id?.indexOf('kai') === 0) continue;
          
          const result = await channel.query({
            messages: {
              created_at_after_or_equal: sevenDaysAgo.toISOString(),
              limit: 100,
            },
          });
          
          // Step 3: Format messages with dates
          const formatted = result.messages
            .filter(msg => msg.type !== 'system' && msg.user?.name && msg.created_at)
            .map(msg => {
              const date = new Date(msg.created_at!).toISOString().split('T')[0];
              return `[${date}] ${msg.user?.name}: ${msg.text}`;
            });
          
          recentMessages.push(...formatted);
        }
        
        console.log(`📅 Fetched ${recentMessages.length} recent messages from ${channels.length} channels for daily summary`);
        
        // Step 4: Fetch user's tasks with status
        let taskSummary: string[] = [];
        try {
          const tasks = await Task.find({
            $or: [
              { assignee: { $in: [this.user.id] } },
              { createdBy: this.user.id }
            ]
          })
          .select('name status completed createdAt completionDate assignee')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
          
          // Group tasks by status
          const completedTasks = tasks.filter(t => t.status === 'completed' || t.completed);
          const inProgressTasks = tasks.filter(t => t.status === 'in_progress' && !t.completed);
          const todoTasks = tasks.filter(t => t.status === 'todo' && !t.completed);
          
          if (completedTasks.length > 0) {
            taskSummary.push(`\nCompleted Tasks (${completedTasks.length}):`);
            completedTasks.slice(0, 10).forEach(task => {
              taskSummary.push(`✓ ${task.name}`);
            });
          }
          
          if (inProgressTasks.length > 0) {
            taskSummary.push(`\nIn Progress Tasks (${inProgressTasks.length}):`);
            inProgressTasks.slice(0, 10).forEach(task => {
              taskSummary.push(`⏳ ${task.name}`);
            });
          }
          
          if (todoTasks.length > 0) {
            taskSummary.push(`\nTo Do Tasks (${todoTasks.length}):`);
            todoTasks.slice(0, 10).forEach(task => {
              const dueDate = task.completionDate ? new Date(task.completionDate).toISOString().split('T')[0] : 'No due date';
              taskSummary.push(`○ ${task.name} (Due: ${dueDate})`);
            });
          }
          
          console.log(`📊 Fetched ${tasks.length} tasks: ${completedTasks.length} completed, ${inProgressTasks.length} in progress, ${todoTasks.length} to do`);
        } catch (error) {
          console.error('❌ Error fetching tasks:', error);
        }
        
        // Step 5: Create a TEMPORARY thread (will be discarded after response)
        const tempThread = await this.openai.beta.threads.create();
        threadToUse = tempThread;
        
        const today = new Date().toISOString().split('T')[0];
        
        // Step 6: Add user message to temp thread
        // Check if user sent attachments (images or documents)
        if (attachments && attachments.length > 0) {
          const attachment = attachments[0];
          // Check if it's an image: type === 'image' OR mime_type starts with 'image/'
          const isImage = attachment.type === 'image' || attachment.mime_type?.startsWith('image/') || attachment.type?.startsWith('image/');
          
          if (isImage) {
            // For images, use vision API with image_url
            await this.openai.beta.threads.messages.create(tempThread.id, {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: e || 'Please analyze this image.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: attachment.url
                  }
                }
              ]
            });
            additionalInstructions = `Analyze the image and respond to the user's question. Be detailed and helpful.`;
          } else {
            // For documents, upload to OpenAI and attach
            // OpenAI supports: pdf, txt, md, docx, xlsx, csv, json, pptx
            const supportedExtensions = ['.pdf', '.txt', '.md', '.docx', '.xlsx', '.csv', '.json', '.pptx'];
            const filename = attachment.filename || attachment.name || 'document';
            const hasExtension = supportedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
            
            if (!hasExtension) {
              // Try to infer extension from mime_type
              const mimeToExt: { [key: string]: string } = {
                'application/pdf': '.pdf',
                'text/plain': '.txt',
                'text/markdown': '.md',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
                'text/csv': '.csv',
                'application/json': '.json',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx'
              };
              
              const inferredExt = attachment.mime_type ? mimeToExt[attachment.mime_type] : null;
              const finalFilename = inferredExt ? `${filename}${inferredExt}` : `${filename}.txt`;
              
              try {
                const response = await fetch(attachment.url);
                const blob = await response.blob();
                const file = new File([blob], finalFilename, { type: attachment.mime_type || attachment.type || 'application/octet-stream' });
                
                const uploadedFile = await this.openai.files.create({
                  file: file,
                  purpose: 'assistants'
                });
                
                await this.openai.beta.threads.messages.create(tempThread.id, {
                  role: 'user',
                  content: e || 'Please analyze this document.',
                  attachments: [{
                    file_id: uploadedFile.id,
                    tools: [{ type: 'file_search' }]
                  }]
                });
                
                additionalInstructions = `Analyze the document and respond to the user's question. Be detailed and helpful.`;
              } catch (fileError) {
                console.error('Error uploading file to OpenAI:', fileError);
                await this.openai.beta.threads.messages.create(tempThread.id, {
                  role: 'user',
                  content: `${e || 'User sent a file'} (Note: File upload failed, continuing without it)`,
                });
                additionalInstructions = `Respond helpfully even though the file couldn't be processed.`;
              }
            } else {
              // File already has supported extension
              try {
                const response = await fetch(attachment.url);
                const blob = await response.blob();
                const file = new File([blob], filename, { type: attachment.mime_type || attachment.type || 'application/octet-stream' });
                
                const uploadedFile = await this.openai.files.create({
                  file: file,
                  purpose: 'assistants'
                });
                
                await this.openai.beta.threads.messages.create(tempThread.id, {
                  role: 'user',
                  content: e || 'Please analyze this document.',
                  attachments: [{
                    file_id: uploadedFile.id,
                    tools: [{ type: 'file_search' }]
                  }]
                });
                
                additionalInstructions = `Analyze the document and respond to the user's question. Be detailed and helpful.`;
              } catch (fileError) {
                console.error('Error uploading file to OpenAI:', fileError);
                await this.openai.beta.threads.messages.create(tempThread.id, {
                  role: 'user',
                  content: `${e || 'User sent a file'} (Note: File upload failed, continuing without it)`,
                });
                additionalInstructions = `Respond helpfully even though the file couldn't be processed.`;
              }
            }
          }
        }
        // Step 7: Add conversations and tasks summary (if no attachments or as additional context)
        else if (recentMessages.length > 0 || taskSummary.length > 0) {
          let context = '';
          
        if (recentMessages.length > 0) {
            context += `Recent Conversations (Last 7 days):\n${recentMessages.join('\n')}`;
          }
          
          if (taskSummary.length > 0) {
            if (context) context += '\n\n';
            context += `Task Status:\n${taskSummary.join('\n')}`;
          }
          
          await this.openai.beta.threads.messages.create(tempThread.id, {
            role: 'user',
            content: `Today is ${today}.\n\n${context}\n\nPlease provide a daily summary for ${this.user.name}.`,
          });
          
          additionalInstructions = `Analyze these conversations and tasks. Include task progress in your summary (completed, in progress, to do). Remember dates in messages are relative to when they were sent, not today (${today}).`;
        } else {
          await this.openai.beta.threads.messages.create(tempThread.id, {
            role: 'user',
            content: `Today is ${today}. No recent conversations or tasks found. Greet ${this.user.name} and let them know all is good.`,
          });
          
          additionalInstructions = `Greet the user warmly.`;
        }
        
      } catch (error) {
        console.error('❌ Error fetching recent messages:', error);
        // Fallback: use main thread
        await this.openai.beta.threads.messages.create(this.openAiThread.id, {
          role: 'user',
          content: e,
        });
        const today = new Date().toISOString().split('T')[0];
        additionalInstructions = `Today is ${today}. Analyze recent conversations and provide a daily summary.`;
      }
    } else if (isKaiUser && usePersistentThread) {
      // FOR Q&A AGENT: Use PERSISTENT thread to remember conversation history
      console.log('🧠 Using PERSISTENT thread for Q&A (remembers conversation + uploaded files)');
      console.log('📝 Thread ID:', this.openAiThread.id);
      
      // Fetch user's tasks to provide context
      let taskContext = '';
      try {
        const tasks = await Task.find({
          $or: [
            { assignee: { $in: [this.user.id] } },
            { createdBy: this.user.id }
          ]
        })
        .select('name status completed createdAt completionDate assignee')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
        
        const completedTasks = tasks.filter(t => t.status === 'completed' || t.completed);
        const inProgressTasks = tasks.filter(t => t.status === 'in_progress' && !t.completed);
        const todoTasks = tasks.filter(t => t.status === 'todo' && !t.completed);
        
        taskContext = `\n\n[User's Current Tasks - ${new Date().toISOString().split('T')[0]}]\n`;
        if (completedTasks.length > 0) {
          taskContext += `Completed (${completedTasks.length}): ${completedTasks.filter(t => t.name).slice(0, 5).map(t => t.name).join(', ')}\n`;
        }
        if (inProgressTasks.length > 0) {
          taskContext += `In Progress (${inProgressTasks.length}): ${inProgressTasks.filter(t => t.name).slice(0, 5).map(t => t.name).join(', ')}\n`;
        }
        if (todoTasks.length > 0) {
          taskContext += `To Do (${todoTasks.length}): ${todoTasks.filter(t => t.name).slice(0, 5).map(t => `${t.name} (Due: ${t.completionDate ? new Date(t.completionDate).toISOString().split('T')[0] : 'No due date'})`).join(', ')}`;
        }
        
        console.log('📊 Loaded task context:', taskContext.split('\n').length, 'lines');
      } catch (error) {
        console.error('❌ Error fetching tasks for Q&A context:', error);
      }
      
      // Handle attachments (images and documents)
      if (attachments && attachments.length > 0) {
        const attachment = attachments[0];
        const isImage = attachment.type === 'image' || attachment.mime_type?.startsWith('image/') || attachment.type?.startsWith('image/');
        
        console.log(`📎 Processing attachment: ${attachment.name} (type: ${attachment.type}, isImage: ${isImage})`);
        
        if (isImage) {
          // For images, use vision API with image_url
          console.log('📸 Processing image attachment:', attachment.url);
          await this.openai.beta.threads.messages.create(this.openAiThread.id, {
            role: 'user',
            content: [
              {
                type: 'text',
                text: e || 'Please analyze this image.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: attachment.url
                }
              }
            ]
          });
          console.log('✅ Image message created in thread');
        } else {
          // For documents, upload to OpenAI and attach
          console.log('📄 Processing document attachment:', attachment.name);
          const supportedExtensions = ['.pdf', '.txt', '.md', '.docx', '.xlsx', '.csv', '.json', '.pptx'];
          const filename = attachment.filename || attachment.name || 'document';
          const hasExtension = supportedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
          
          if (!hasExtension) {
            // Try to infer extension from mime_type
            const mimeToExt: { [key: string]: string } = {
              'application/pdf': '.pdf',
              'text/plain': '.txt',
              'text/markdown': '.md',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
              'text/csv': '.csv',
              'application/json': '.json',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx'
            };
            
            const inferredExt = attachment.mime_type ? mimeToExt[attachment.mime_type] : null;
            const finalFilename = inferredExt ? `${filename}${inferredExt}` : `${filename}.txt`;
            
            try {
              const response = await fetch(attachment.url);
              const fileBlob = await response.blob();
              const file = new File([fileBlob], finalFilename, { type: attachment.mime_type || 'application/octet-stream' });
              
              const uploadedFile = await this.openai.files.create({
                file: file,
                purpose: 'assistants'
              });
              
              await this.openai.beta.threads.messages.create(this.openAiThread.id, {
                role: 'user',
                content: e || 'Please analyze this document.',
                attachments: [{ file_id: uploadedFile.id, tools: [{ type: 'file_search' }] }]
              });
              
              console.log('✅ Document uploaded and attached to thread:', uploadedFile.id);
            } catch (error) {
              console.error('❌ Error uploading document:', error);
              // Fallback: just send the message
              await this.openai.beta.threads.messages.create(this.openAiThread.id, {
                role: 'user',
                content: e || 'Please analyze this document.',
              });
            }
          } else {
            // Filename already has extension
            try {
              const response = await fetch(attachment.url);
              const fileBlob = await response.blob();
              const file = new File([fileBlob], filename, { type: attachment.mime_type || 'application/octet-stream' });
              
              const uploadedFile = await this.openai.files.create({
                file: file,
                purpose: 'assistants'
              });
              
              await this.openai.beta.threads.messages.create(this.openAiThread.id, {
                role: 'user',
                content: e || 'Please analyze this document.',
                attachments: [{ file_id: uploadedFile.id, tools: [{ type: 'file_search' }] }]
              });
              
              console.log('✅ Document uploaded and attached to thread:', uploadedFile.id);
            } catch (error) {
              console.error('❌ Error uploading document:', error);
              // Fallback: just send the message
              await this.openai.beta.threads.messages.create(this.openAiThread.id, {
                role: 'user',
                content: e || 'Please analyze this document.',
              });
            }
          }
        }
      } else {
        // No attachments, just send the message (clean, no task context appended)
        await this.openai.beta.threads.messages.create(this.openAiThread.id, {
          role: 'user',
          content: e || 'Hi',
        });
        console.log('✅ Message created in persistent thread');
      }
      
      const today = new Date().toISOString().split('T')[0];
      
      // Only include task context if user is asking about tasks
      const isAskingAboutTasks = e && (
        e.toLowerCase().includes('task') || 
        e.toLowerCase().includes('todo') || 
        e.toLowerCase().includes('completed') ||
        e.toLowerCase().includes('in progress')
      );
      
      if (isAskingAboutTasks && taskContext) {
        additionalInstructions = `Today is ${today}. The user is asking about tasks. Here is their current task summary:${taskContext}\n\nFormat your response cleanly with proper task names and due dates. Be conversational and helpful.`;
      } else {
        additionalInstructions = `Today is ${today}. Answer the user's question based on the conversation history and uploaded files. Be helpful and conversational.`;
      }
    } else {
      // FOR REGULAR USERS: Use main thread normally
      // Handle attachments for regular users too
      if (attachments && attachments.length > 0) {
        const attachment = attachments[0];
        // Check if it's an image: type === 'image' OR mime_type starts with 'image/'
        const isImage = attachment.type === 'image' || attachment.mime_type?.startsWith('image/') || attachment.type?.startsWith('image/');
        
        if (isImage) {
          await this.openai.beta.threads.messages.create(this.openAiThread.id, {
            role: 'user',
            content: [
              {
                type: 'text',
                text: e || 'Analyze this image'
              },
              {
                type: 'image_url',
                image_url: {
                  url: attachment.url
                }
              }
            ]
          });
        } else {
          // For documents in regular chat (just acknowledge, don't process)
          await this.openai.beta.threads.messages.create(this.openAiThread.id, {
            role: 'user',
            content: `${e || 'User sent a document'}: ${attachment.name || attachment.filename}`,
          });
        }
      } else {
      await this.openai.beta.threads.messages.create(this.openAiThread.id, {
        role: 'user',
        content: e,
      });
      }
      additionalInstructions = `Analyze this message and any attached images. Classify it as a task, event, or none.

If it's a TASK (action item, todo, deliverable), respond with JSON:
{"type": "task", "title": "...", "description": "...", "priority": "low|medium|high", "dueDate": "ISO date or null", "assignees": ["@mentioned users"]}

If it's an EVENT (meeting, call, scheduled occurrence), respond with JSON:
{"type": "event", "title": "...", "startDate": "ISO date", "endDate": "ISO date or null", "location": "...", "attendees": ["@mentioned users"]}

If it's neither, respond: {"type": "none"}

For images: Extract any dates, times, meeting details, deadlines, or task information visible in the image.
Only respond with JSON, no other text.`;
    }

    try {
      const run = this.openai.beta.threads.runs.stream(threadToUse.id, {
        assistant_id: this.assistant.id,
        additional_instructions: additionalInstructions,
      });

      const handler = new OpenAIResponseHandler(
        this.openai,
        threadToUse,
        run,
        this.chatClient,
        this.channel,
        this.user,
        messageId,
      );
      
      void handler.run();
      this.handlers.push(handler);
    } catch (error) {
      console.error("Error in handleMessage:", error);
    }
  };
}