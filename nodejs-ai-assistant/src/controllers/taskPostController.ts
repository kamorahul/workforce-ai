import express, { Request, Response, Router } from 'express';
import { Task, ITask } from '../models/Task';
import { Comment } from '../models/Comment';
import { getStreamFeedsService } from '../utils/getstreamFeedsService';
import multer from 'multer';
import { uploadToS3 } from '../utils/s3';

interface TaskAttachment {
  uri: string;
  name: string;
  type: string;
  size?: number;
  commentId?: string; 
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, and videos
    if (file.mimetype.startsWith('image/') || 
        file.mimetype === 'application/pdf' ||
        file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only images, PDFs, and videos are allowed.'));
    }
  }
});

export const handleTaskPost = async (req: Request, res: Response) => {
  try {
    const { name, assignee, priority, completionDate, channelId, description, subtasks, createdBy, parentTaskId, attachments } = req.body;
    if (!name || !assignee || !Array.isArray(assignee) || assignee.length === 0 || !priority || !completionDate) {
      res.status(400).json({ error: 'Missing required fields or assignee must be a non-empty array' });
      return;
    }

    // Create the main task
    const task: ITask = new Task({
      name,
      assignee,
      priority,
      completionDate: new Date(completionDate),
      channelId,
      description,
      createdBy: createdBy || assignee[0], // Use first assignee as default creator
      parentTaskId, // Will be undefined for top-level tasks
      attachments: attachments || [], // Handle attachments
    });
    await task.save();

    // Create subtasks if provided
    const createdSubtasks = [];
    if (subtasks && Array.isArray(subtasks)) {
      for (const subtask of subtasks) {
        const newSubtask: ITask = new Task({
          name: subtask.name,
          assignee: subtask.assignee || assignee, // Inherit assignees from parent if not specified
          priority: subtask.priority || priority, // Inherit priority from parent if not specified
          completionDate: subtask.completionDate ? new Date(subtask.completionDate) : new Date(completionDate),
          channelId,
          description: subtask.description,
          createdBy: createdBy || assignee[0],
          parentTaskId: task._id, // Link to parent task
        });
        await newSubtask.save();
        // Create notification for subtask (with self-exclusion)
        await getStreamFeedsService.createTaskActivity(newSubtask._id as string, newSubtask);
        
        // Create activity on parent task for subtask addition
        const taskCreator = createdBy || assignee[0];
        // Resolve username for display in activity feed
        const actorName = await getStreamFeedsService.getUserName(taskCreator);
        const tasksFeed = getStreamFeedsService['getstreamClient'].feed('tasks', String(task._id));
        await tasksFeed.addActivity({
          actor: taskCreator,
          verb: 'task_subtask_added',
          object: String(task._id),
          extra: {
            taskId: String(task._id),
            taskName: task.name || 'Untitled Task',
            subtaskId: String(newSubtask._id),
            subtaskName: newSubtask.name,
            actor: taskCreator,
            actorName: actorName, // Resolved username for display
            channelId: task.channelId
          }
        });
        
        createdSubtasks.push(newSubtask);
      }
    }

    // Create notification for main task (with self-exclusion)
    await getStreamFeedsService.createTaskActivity(task._id as string, task);
    res.status(201).json({ 
      status: 'success', 
      task,
      subtasks: createdSubtasks 
    });
  } catch (error) {
    console.error('Error saving task:', error);
    res.status(500).json({ error: 'Failed to save task' });
  }
};

const router: Router = express.Router();
router.post('/', handleTaskPost);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      assignee, 
      channelId, 
      createdBy, 
      isCompleted, 
      includeSubtasks, 
      parentTaskId,
      limit = '50',  // Default 50 tasks per page (increased for better UX with grouping)
      offset = '0'   // Default start from beginning
    } = req.query;
    
    const query: any = {};
    const andConditions: any[] = [];

    if (assignee && createdBy) {
      // Fetch tasks where user is either in assignee array or creator
      andConditions.push({
        $or: [
          { assignee: { $in: [assignee as string] } },
          { createdBy: createdBy as string }
        ]
      });
    } else if (assignee) {
      query.assignee = { $in: [assignee as string] };
    } else if (createdBy) {
      query.createdBy = createdBy as string;
    }

    if (channelId) {
      // Support both full cid format (messaging:channel-name) and extracted ID (channel-name)
      const channelIdStr = channelId as string;
      const extractedId = channelIdStr.includes(':') ? channelIdStr.split(':')[1] : channelIdStr;
      const fullCid = channelIdStr.includes(':') ? channelIdStr : `messaging:${channelIdStr}`;

      // Match tasks with any of the channelId formats
      andConditions.push({
        $or: [
          { channelId: channelIdStr },
          { channelId: extractedId },
          { channelId: fullCid }
        ]
      });
    }

    // Combine $and conditions if any exist
    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    // Add completed filter if isCompleted is provided
    if (isCompleted !== undefined) {
      query.completed = isCompleted === 'true';
    }

    // Filter by parent task ID if provided
    if (parentTaskId) {
      query.parentTaskId = parentTaskId;
    } else if (includeSubtasks !== 'true') {
      // If not explicitly including subtasks and no parent specified, only show top-level tasks
      query.parentTaskId = { $exists: false };
    }

    // Convert pagination params to numbers
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    // Get total count for pagination info
    const totalCount = await Task.countDocuments(query);

    // Fetch tasks with pagination and field selection for performance
    const tasks = await Task.find(query)
      .select('_id name status priority completionDate channelId createdAt createdBy assignee description completed')
      .limit(limitNum)
      .skip(offsetNum)
      .sort({ createdAt: -1 })  // Newest first for better UX
      .lean();  // Use lean() for faster queries

    // Fetch subtask counts efficiently with aggregation
    const tasksWithCounts = await Promise.all(tasks.map(async (task) => {
      const subtaskStats = await Task.aggregate([
        { $match: { parentTaskId: task._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$completed', true] }, 1, 0] }
            }
          }
        }
      ]);

      const counts = subtaskStats[0] || { total: 0, completed: 0 };
      
      // Ensure status field is set
      if (!task.status) {
        task.status = task.completed ? 'completed' : 'todo';
      }
      
      return {
        ...task,
        subtaskCounts: {
          total: counts.total,
          completed: counts.completed
        }
      };
    }));

    // Calculate hasMore flag
    const hasMore = offsetNum + limitNum < totalCount;

    res.status(200).json({ 
      status: 'success', 
      tasks: tasksWithCounts,
      total: totalCount,
      limit: limitNum,
      offset: offsetNum,
      hasMore: hasMore
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});
// Get task details with comments and subtasks
router.get('/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }

    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Fetch comments for the task
    const comments = await Comment.find({ taskId }).sort({ createdAt: 1 });

    // Fetch subtasks if this is a parent task
    const subtasks = await Task.find({ parentTaskId: taskId });

    // Ensure status field is set based on completed flag if not already set
    const taskObj = task.toObject();
    if (!taskObj.status) {
      taskObj.status = taskObj.completed ? 'completed' : 'todo';
    }

    res.status(200).json({ 
      status: 'success', 
      task: taskObj,
      subtasks,
      comments 
    });
  } catch (error) {
    console.error('Error fetching task details:', error);
    res.status(500).json({ error: 'Failed to fetch task details' });
  }
});

router.patch('/:taskId/complete', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { completeSubtasks, completed } = req.query;
    
    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }

    // Get current task to determine new completion status
    const currentTask = await Task.findById(taskId);
    if (!currentTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Toggle completion status if 'completed' query param is provided, otherwise default to true
    const newCompletedStatus = completed !== undefined ? completed === 'true' : !currentTask.completed;

    const task = await Task.findByIdAndUpdate(
      taskId,
      { completed: newCompletedStatus },
      { new: true }
    );

    // If completeSubtasks is true, also toggle all subtasks
    if (completeSubtasks === 'true') {
      await Task.updateMany(
        { parentTaskId: taskId },
        { completed: newCompletedStatus }
      );
    }

    // Fetch updated subtasks if any were toggled
    const subtasks = completeSubtasks === 'true' 
      ? await Task.find({ parentTaskId: taskId })
      : [];

    res.status(200).json({ 
      status: 'success', 
      task,
      subtasks: completeSubtasks === 'true' ? subtasks : undefined
    });
  } catch (error) {
    console.error('Error toggling task completion:', error);
    res.status(500).json({ error: 'Failed to toggle task completion' });
  }
});

router.put('/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }
    
    // Get the original task before updating
    const originalTask = await Task.findById(taskId);
    if (!originalTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    const { 
      name, assignee, priority, completionDate, channelId, 
      description, completed, status, parentTaskId, attachments,
      userId  // User making the update
    } = req.body;
    
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (assignee !== undefined) {
      if (!Array.isArray(assignee) || assignee.length === 0) {
        res.status(400).json({ error: 'Assignee must be a non-empty array' });
        return;
      }
      updateData.assignee = assignee;
    }
    if (priority !== undefined) updateData.priority = priority;
    if (completionDate !== undefined) updateData.completionDate = new Date(completionDate);
    if (channelId !== undefined) updateData.channelId = channelId;
    if (description !== undefined) updateData.description = description;
    if (completed !== undefined) updateData.completed = completed;
    if (status !== undefined) updateData.status = status;
    if (parentTaskId !== undefined) updateData.parentTaskId = parentTaskId;
    if (attachments !== undefined) updateData.attachments = attachments;
    
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    // Create notifications for task updates (with self-exclusion)
    // Pass userId as actor for activities
    try {
      // Ensure we have the userId - check both req.body.userId and the extracted userId
      const actorUserId = userId || req.body.userId || updatedTask.createdBy || 'system';
      console.log('Task update - Actor userId:', actorUserId, 'from req.body.userId:', req.body.userId);
      
      // Only include fields that are actually being updated (from updateData, not the entire req.body)
      // This prevents creating activities for fields that didn't change
      const updateDataWithActor = {
        ...updateData, // Only include fields that were actually updated
        actor: actorUserId,
        userId: actorUserId // Also set userId explicitly for consistency
      };
      await getStreamFeedsService.createTaskUpdateNotifications(originalTask, updatedTask, updateDataWithActor);
    } catch (error) {
      console.error('Error creating task update notifications:', error);
      // Continue even if notifications fail
    }
    
    res.status(200).json({ status: 'success', task: updatedTask });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete a task
router.delete('/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }

    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // If this is a parent task, also delete all subtasks
    if (!task.parentTaskId) {
      await Task.deleteMany({ parentTaskId: taskId });
    }

    // Delete the task itself
    await Task.findByIdAndDelete(taskId);

    res.status(200).json({ 
      status: 'success', 
      message: 'Task deleted successfully',
      deletedTaskId: taskId 
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Handle file upload
router.post('/:taskId/attachments/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const file = req.file;
    
    if (!taskId || !file) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Generate unique file name
    const uniqueFileName = `${Date.now()}-${file.originalname}`;
    
    // Upload file to S3 and get URL
    const fileUrl = await uploadToS3(file.buffer, uniqueFileName, file.mimetype);

    // Create attachment object
    const newAttachment = {
      uri: fileUrl,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
      commentId: req.body.commentId ? String(req.body.commentId) : null,
    };

    // Add new attachment to task
    const updatedAttachments = [...(task.attachments || []), newAttachment];
    
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { attachments: updatedAttachments },
      { new: true }
    );

    // Create activity and notification for attachment addition
    try {
      // Get userId from FormData - multer parses all fields into req.body
      // Check multiple sources to ensure we get the userId
      const attachmentUserId = req.body?.userId || req.query?.userId as string || task.createdBy || 'system';
      console.log('Attachment upload - Actor userId:', attachmentUserId);
      console.log('Attachment upload - req.body:', JSON.stringify(req.body));
      console.log('Attachment upload - req.query:', JSON.stringify(req.query));
      
      // If userId is still 'system', log a warning
      if (attachmentUserId === 'system') {
        console.warn('⚠️ Attachment upload - userId not found in request, using system as fallback');
      }

      // Resolve username for display in activity feed
      const attachmentActorName = await getStreamFeedsService.getUserName(attachmentUserId);

      // Add activity to tasks feed
      const tasksFeed = await getStreamFeedsService['getstreamClient'].feed('tasks', taskId);
      await tasksFeed.addActivity({
        actor: attachmentUserId,
        verb: 'task_attachment_added',
        object: taskId,
        extra: {
          taskId: taskId,
          taskName: task.name,
          fileName: file.originalname,
          fileType: file.mimetype,
          actor: attachmentUserId, // Store in extra for reliable extraction
          actorName: attachmentActorName, // Resolved username for display
          channelId: task.channelId
        }
      });
      
      // Send notifications to users
      const usersToNotify = new Set([
        ...(task.assignee || []),
        task.createdBy
      ].filter(Boolean));

      for (const userId of usersToNotify) {
            await getStreamFeedsService.createNotification(
          userId,
          'task_attachment_added',
          taskId,
          {
            taskId: taskId,
            taskName: task.name,
            fileName: file.originalname,
            fileType: file.mimetype,
            actor: attachmentUserId,
            channelId: task.channelId
          }
        );
      }
    } catch (error) {
      console.error('Error creating attachment notification:', error);
      // Continue even if notification fails
    }

    res.status(200).json({ 
      status: 'success',
      task: updatedTask,
      attachment: newAttachment,
      message: 'Attachment added successfully'
    });
  } catch (error) {
    console.error('Error handling attachment upload:', error);
    res.status(500).json({ error: 'Failed to handle attachment upload' });
  }
});

// Get task attachments
router.get('/:taskId/attachments', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }

    const task = await Task.findById(taskId).select('attachments');
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    {/*res.status(200).json({ 
      status: 'success', 
      attachments: task.attachments || [],
      taskId: taskId
    });*/}
    res.status(200).json({ 
      status: 'success', 
      attachments: (task.attachments || []).map((att: TaskAttachment) => ({
        uri: att.uri,
        name: att.name,
        type: att.type,
        size: att.size,
        commentId: att.commentId || null
      })),
      taskId
    });    
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Remove attachment from task
router.delete('/:taskId/attachments/:attachmentIndex', async (req: Request, res: Response) => {
  try {
    const { taskId, attachmentIndex } = req.params;
    // Get userId from query params (more reliable for DELETE requests)
    const userId = req.query.userId as string || req.body.userId;
    
    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }

    const index = parseInt(attachmentIndex);
    if (isNaN(index) || index < 0) {
      res.status(400).json({ error: 'Invalid attachment index' });
      return;
    }

    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (!task.attachments || index >= task.attachments.length) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    // Remove the attachment at the specified index
    const removedAttachment = task.attachments[index];
    const updatedAttachments = task.attachments.filter((_, i) => i !== index);
    
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { attachments: updatedAttachments },
      { new: true }
    );

    // Create activity and notification for attachment removal
    try {
      // Get userId from query params (for DELETE) or body
      const attachmentRemoveUserId = userId || 'system';
      console.log('Attachment removal - Actor userId:', attachmentRemoveUserId);

      // Resolve username for display in activity feed
      const attachmentRemoveActorName = await getStreamFeedsService.getUserName(attachmentRemoveUserId);

      // Add activity to tasks feed
      const tasksFeed = await getStreamFeedsService['getstreamClient'].feed('tasks', taskId);
      await tasksFeed.addActivity({
        actor: attachmentRemoveUserId,
        verb: 'task_attachment_removed',
        object: taskId,
        extra: {
          taskId: taskId,
          taskName: task.name,
          fileName: removedAttachment.name,
          actor: attachmentRemoveUserId, // Store in extra for reliable extraction
          actorName: attachmentRemoveActorName, // Resolved username for display
          channelId: task.channelId
        }
      });
      
      // Send notifications to users
      const usersToNotify = new Set([
        ...(task.assignee || []),
        task.createdBy
      ].filter(Boolean));

      for (const userIdToNotify of usersToNotify) {
        await getStreamFeedsService.createNotification(
          userIdToNotify,
          'task_attachment_removed',
          taskId,
          {
            taskId: taskId,
            taskName: task.name,
            fileName: removedAttachment.name,
            actor: attachmentRemoveUserId,
            channelId: task.channelId
          }
        );
      }
    } catch (error) {
      console.error('Error creating attachment removal notification:', error);
      // Continue even if notification fails
    }

    res.status(200).json({ 
      status: 'success', 
      task: updatedTask,
      message: 'Attachment removed successfully'
    });
  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({ error: 'Failed to remove attachment' });
  }
});

// GET /task/:taskId/activities - Get all activities for a task from GetStream
router.get('/:taskId/activities', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      res.status(400).json({ error: 'Task ID is required' });
      return;
    }

    console.log('Fetching activities for task:', taskId);
    
    // Get activities from GetStream
    const activities = await getStreamFeedsService.getTaskActivities(taskId);
    
    res.status(200).json({ 
      status: 'success',
      activities: activities
    });
  } catch (error) {
    console.error('Error fetching task activities:', error);
    res.status(500).json({ error: 'Failed to fetch task activities' });
  }
});

export default router;