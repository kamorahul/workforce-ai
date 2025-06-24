import cron from 'node-cron';
import { serverClient } from '../serverClient';
import { Task } from '../models/Task';

interface ConversationMessage {
  sender: string;
  message: string;
  timestamp: string;
}

interface AnalyzeConversationParams {
  conversation: ConversationMessage[];
  user_id: string;
  context?: string;
}

interface TaskAnalysis {
  action: string;
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
  dependencies?: string[];
}

export async function analyze_conversation(params: AnalyzeConversationParams): Promise<TaskAnalysis[]> {
  const { conversation, user_id, context } = params;
  
  const tasks: TaskAnalysis[] = [];
  
  // Analyze each message in the conversation
  for (const message of conversation) {
    const messageContent = message.message.toLowerCase();
    const sender = message.sender;
    
    // Check if the message mentions or is directed to the user
    const isUserMentioned = messageContent.includes(user_id.toLowerCase()) || 
                           messageContent.includes(`@${user_id.toLowerCase()}`);
    
    // Check if the message is from the user (they might be assigning themselves tasks)
    const isFromUser = sender === user_id;
    
    if (isUserMentioned || isFromUser) {
      // Extract potential tasks from the message
      const extractedTasks = extractTasksFromMessage(messageContent, user_id);
      tasks.push(...extractedTasks);
    }
  }
  
  // Remove duplicates and prioritize tasks
  const uniqueTasks = removeDuplicateTasks(tasks);
  const prioritizedTasks = prioritizeTasks(uniqueTasks);
  
  return prioritizedTasks;
}

function extractTasksFromMessage(messageContent: string, user_id: string): TaskAnalysis[] {
  const tasks: TaskAnalysis[] = [];
  
  // Priority indicators
  const highPriorityWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency'];
  const mediumPriorityWords = ['soon', 'this week', 'important'];
  const lowPriorityWords = ['when possible', 'later', 'low priority'];
  
  // Determine priority based on message content
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (highPriorityWords.some(word => messageContent.includes(word))) {
    priority = 'high';
  } else if (lowPriorityWords.some(word => messageContent.includes(word))) {
    priority = 'low';
  }
  
  // Extract tasks using more specific patterns
  const taskPatterns = [
    // Direct requests: "can you do X", "please do X", "need to do X"
    /(?:can you|could you|please|need to|should|must|have to)\s+([^.!?]+?)(?:[.!?]|$)/gi,
    // Mentions: "@user do X"
    /(?:@\w+)\s+([^.!?]+?)(?:[.!?]|$)/gi,
    // Task assignments: "assign: X", "task: X"
    /(?:assign|task|todo|action item)\s*[:]\s*([^.!?]+?)(?:[.!?]|$)/gi,
  ];
  
  for (const pattern of taskPatterns) {
    const matches = messageContent.matchAll(pattern);
    for (const match of matches) {
      const taskDescription = match[1]?.trim();
      if (taskDescription && taskDescription.length > 3) {
        // Clean up the task description
        let cleanTask = taskDescription
          .replace(/^(can you|could you|please|need to|should|must|have to)\s+/i, '')
          .replace(/^(assign|task|todo|action item)\s*[:]\s*/i, '')
          .replace(/^@\w+\s+/, '')
          .trim();
        
        // Skip if the cleaned task is too short or just punctuation
        if (cleanTask.length < 3 || /^[.!?,\s]+$/.test(cleanTask)) {
          continue;
        }
        
        // Extract deadline if mentioned
        const deadlineMatch = cleanTask.match(/(?:by|due|deadline|until)\s+([^,\.]+)/i);
        const deadline = deadlineMatch ? deadlineMatch[1].trim() : undefined;
        
        // Remove deadline from task description if found
        if (deadline) {
          cleanTask = cleanTask.replace(/(?:by|due|deadline|until)\s+[^,\.]+/i, '').trim();
        }
        
        tasks.push({
          action: cleanTask,
          deadline,
          priority,
          dependencies: []
        });
      }
    }
  }
  
  return tasks;
}

function removeDuplicateTasks(tasks: TaskAnalysis[]): TaskAnalysis[] {
  const uniqueTasks: TaskAnalysis[] = [];
  const seenActions = new Set<string>();
  
  for (const task of tasks) {
    // Normalize the action text for better comparison
    const normalizedAction = task.action
      .toLowerCase()
      .trim()
      .replace(/[.!?,\s]+/g, ' ') // Replace punctuation with spaces
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();
    
    if (!seenActions.has(normalizedAction)) {
      seenActions.add(normalizedAction);
      uniqueTasks.push(task);
    }
  }
  
  return uniqueTasks;
}

function prioritizeTasks(tasks: TaskAnalysis[]): TaskAnalysis[] {
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  
  return tasks.sort((a, b) => {
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // If same priority, sort by deadline (tasks with deadlines come first)
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    
    return 0;
  });
}

export const processTaskAnalysisForChannels = async () => {
  console.log('CRON: Starting task analysis for all channels...');

  try {
    // Get all messaging channels
    const channels = await serverClient.queryChannels(
      { type: 'messaging' },
      {},
      { limit: 100 }
    );

    console.log(`CRON: Found ${channels.length} channels to analyze`);

    for (const channel of channels) {
      try {
        console.log(`CRON: Analyzing channel: ${channel.id}`);
        
        // Get channel members
        const channelMembers = channel.state?.members || {};
        const memberIds = Object.keys(channelMembers);

        if (memberIds.length === 0) {
          console.log(`CRON: No members found in channel ${channel.id}, skipping`);
          continue;
        }

        // Get recent messages from the channel (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const channelInstance = serverClient.channel('messaging', String(channel.id || 'unknown'));
        const messages = await channelInstance.query({
          messages: { 
            limit: 200, 
            created_at_after_or_equal: sevenDaysAgo.toISOString() 
          }
        });

        if (messages.messages.length === 0) {
          console.log(`CRON: No recent messages in channel ${channel.id}, skipping`);
          continue;
        }

        console.log(`CRON: Found ${messages.messages.length} messages in channel ${channel.id}`);

        // Convert messages to conversation format
        const conversation = messages.messages
          .filter(msg => msg.type !== 'system' && msg.user?.id)
          .map(msg => ({
            sender: msg.user?.id || 'unknown',
            message: msg.text || '',
            timestamp: msg.created_at ? new Date(msg.created_at).toISOString() : new Date().toISOString()
          }));

        // Analyze tasks for each member
        for (const memberId of memberIds) {
          try {
            const member = channelMembers[memberId];
            if (!member) continue;

            // Analyze conversation for this user
            const tasks = await analyze_conversation({
              conversation,
              user_id: String(memberId),
              context: `Channel: ${String(channel.id || 'unknown')}`
            });

            if (tasks.length > 0) {
              console.log(`CRON: Found ${tasks.length} tasks for user ${member.user?.name || memberId} in channel ${channel.id}`);
              
              // Store tasks in MongoDB
              for (const task of tasks) {
                try {
                  // Check if task already exists (avoid duplicates)
                  const existingTask = await Task.findOne({
                    userId: String(memberId),
                    channelId: String(channel.id || 'unknown'),
                    action: task.action,
                    status: 'pending'
                  });

                  if (!existingTask) {
                    const newTask = new Task({
                      userId: String(memberId),
                      channelId: String(channel.id || 'unknown'),
                      action: task.action,
                      priority: task.priority,
                      deadline: task.deadline,
                      dependencies: task.dependencies || [],
                      context: `Channel: ${String(channel.id || 'unknown')}`,
                      status: 'pending'
                    });

                    await newTask.save();
                    console.log(`CRON: Saved task for user ${member.user?.name || memberId}: ${task.action}`);
                  } else {
                    console.log(`CRON: Task already exists for user ${member.user?.name || memberId}: ${task.action}`);
                  }
                } catch (error) {
                  console.error(`CRON: Error saving task for user ${memberId}:`, error);
                }
              }
            } else {
              console.log(`CRON: No tasks found for user ${member.user?.name || memberId} in channel ${channel.id}`);
            }

          } catch (error) {
            console.error(`CRON: Error processing user ${memberId} in channel ${channel.id}:`, error);
          }
        }

      } catch (error) {
        console.error(`CRON: Error processing channel ${channel.id}:`, error);
      }
    }

    console.log('CRON: Finished task analysis for all channels');
  } catch (error) {
    console.error('CRON: Fatal error in task analysis:', error);
  }
};

export const setupTaskManagerCronJob = () => {
  // Schedule to run daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('CRON: Running daily task analysis job...');
    await processTaskAnalysisForChannels();
  });
};

// Export for manual testing
export const runTaskAnalysisNow = async () => {
  console.log('Manual task analysis triggered...');
  await processTaskAnalysisForChannels();
}; 