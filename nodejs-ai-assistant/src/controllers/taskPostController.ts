import express, { Request, Response, Router } from 'express';
import { Task } from '../models/Task';
import { Comment } from '../models/Comment';
import { getStreamFeedsService } from '../utils/getstreamFeedsService';
import multer from 'multer';
import { uploadToS3 } from '../utils/s3';

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
    const task = new Task({
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
        const newSubtask = new Task({
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
    
    if (assignee && createdBy) {
      // Fetch tasks where user is either in assignee array or creator
      query.$or = [
        { assignee: { $in: [assignee as string] } },
        { createdBy: createdBy as string }
      ];
    } else if (assignee) {
      query.assignee = { $in: [assignee as string] };
    } else if (createdBy) {
      query.createdBy = createdBy as string;
    }
    
    if (channelId) {
      query.channelId = channelId as string;
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
      description, completed, status, parentTaskId, attachments 
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
    try {
      await getStreamFeedsService.createTaskUpdateNotifications(originalTask, updatedTask, req.body);
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
      // Add activity to tasks feed
      const tasksFeed = await getStreamFeedsService['getstreamClient'].feed('tasks', taskId);
      await tasksFeed.addActivity({
        actor: req.body.userId || 'system',
        verb: 'task_attachment_added',
        object: taskId,
        extra: {
          taskId: taskId,
          taskName: task.name,
          fileName: file.originalname,
          fileType: file.mimetype,
          actor: req.body.userId || 'system',
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
            actor: req.body.userId || 'system',
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

    res.status(200).json({ 
      status: 'success', 
      attachments: task.attachments || [],
      taskId: taskId
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
      // Add activity to tasks feed
      const tasksFeed = await getStreamFeedsService['getstreamClient'].feed('tasks', taskId);
      await tasksFeed.addActivity({
        actor: req.body.userId || 'system',
        verb: 'task_attachment_removed',
        object: taskId,
        extra: {
          taskId: taskId,
          taskName: task.name,
          fileName: removedAttachment.name,
          actor: req.body.userId || 'system',
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
          'task_attachment_removed',
          taskId,
          {
            taskId: taskId,
            taskName: task.name,
            fileName: removedAttachment.name,
            actor: req.body.userId || 'system',
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