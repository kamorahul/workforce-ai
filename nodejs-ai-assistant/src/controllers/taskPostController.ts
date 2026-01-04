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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
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

    const task: ITask = new Task({
      name,
      assignee,
      priority,
      completionDate: new Date(completionDate),
      channelId,
      description,
      createdBy: createdBy || assignee[0],
      parentTaskId,
      attachments: attachments || [],
    });
    await task.save();

    const createdSubtasks = [];
    if (subtasks && Array.isArray(subtasks)) {
      for (const subtask of subtasks) {
        const newSubtask: ITask = new Task({
          name: subtask.name,
          assignee: subtask.assignee || assignee,
          priority: subtask.priority || priority,
          completionDate: subtask.completionDate ? new Date(subtask.completionDate) : new Date(completionDate),
          channelId,
          description: subtask.description,
          createdBy: createdBy || assignee[0],
          parentTaskId: task._id,
        });
        await newSubtask.save();

        const taskCreator = createdBy || assignee[0];
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
            actorName: actorName,
            channelId: task.channelId
          }
        });

        createdSubtasks.push(newSubtask);
      }
    }

    if (parentTaskId) {
      const taskCreator = createdBy || assignee[0];
      const actorName = await getStreamFeedsService.getUserName(taskCreator);
      const parentTask = await Task.findById(parentTaskId);
      const parentTaskName = parentTask?.name || 'Untitled Task';

      const tasksFeed = getStreamFeedsService['getstreamClient'].feed('tasks', String(parentTaskId));
      await tasksFeed.addActivity({
        actor: taskCreator,
        verb: 'task_subtask_added',
        object: String(parentTaskId),
        extra: {
          taskId: String(parentTaskId),
          taskName: parentTaskName,
          subtaskId: String(task._id),
          subtaskName: task.name,
          actor: taskCreator,
          actorName: actorName,
          channelId: task.channelId
        }
      });
    } else {
      await getStreamFeedsService.createTaskActivity(task._id as string, task);
    }

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
      limit = '50',
      offset = '0',
      excludeOldIncomplete = 'true',
      maxAgeDays = '90'
    } = req.query;

    const query: any = {};
    const andConditions: any[] = [];

    if (assignee && createdBy) {
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
      const channelIdStr = channelId as string;
      const extractedId = channelIdStr.includes(':') ? channelIdStr.split(':')[1] : channelIdStr;
      const fullCid = channelIdStr.includes(':') ? channelIdStr : `messaging:${channelIdStr}`;

      andConditions.push({
        $or: [
          { channelId: channelIdStr },
          { channelId: extractedId },
          { channelId: fullCid }
        ]
      });
    }

    if (excludeOldIncomplete === 'true' && isCompleted !== 'true') {
      const maxAge = parseInt(maxAgeDays as string, 10) || 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      andConditions.push({
        $or: [
          { completed: true },
          { status: 'completed' },
          { createdAt: { $gte: cutoffDate } },
          { completionDate: { $gte: today } }
        ]
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    if (isCompleted !== undefined) {
      query.completed = isCompleted === 'true';
    }

    if (parentTaskId) {
      query.parentTaskId = parentTaskId;
    } else if (includeSubtasks !== 'true') {
      query.parentTaskId = { $exists: false };
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const totalCount = await Task.countDocuments(query);

    const tasks = await Task.find(query)
      .select('_id name status priority completionDate channelId createdAt createdBy assignee description completed updatedAt')
      .limit(limitNum)
      .skip(offsetNum)
      .sort({ createdAt: -1 })
      .lean();

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

// Get open task count for a channel (lightweight endpoint for badges/counts)
router.get('/count/open', async (req: Request, res: Response) => {
  try {
    const { channelId, assignee, createdBy } = req.query;

    const query: any = {
      // Open tasks: status is not 'completed' AND completed is not true
      $and: [
        { $or: [{ status: { $ne: 'completed' } }, { status: { $exists: false } }] },
        { $or: [{ completed: { $ne: true } }, { completed: { $exists: false } }] }
      ]
    };

    // Exclude subtasks from count
    query.parentTaskId = { $exists: false };

    // Filter by channel if provided
    if (channelId) {
      const channelIdStr = channelId as string;
      const extractedId = channelIdStr.includes(':') ? channelIdStr.split(':')[1] : channelIdStr;
      const fullCid = channelIdStr.includes(':') ? channelIdStr : `messaging:${channelIdStr}`;

      query.$and.push({
        $or: [
          { channelId: channelIdStr },
          { channelId: extractedId },
          { channelId: fullCid }
        ]
      });
    }

    // Filter by assignee or createdBy if provided
    if (assignee && createdBy) {
      query.$and.push({
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

    const count = await Task.countDocuments(query);

    res.status(200).json({
      status: 'success',
      count
    });
  } catch (error) {
    console.error('Error fetching open task count:', error);
    res.status(500).json({ error: 'Failed to fetch open task count' });
  }
});

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

    const comments = await Comment.find({ taskId }).sort({ createdAt: 1 });
    const subtasks = await Task.find({ parentTaskId: taskId });

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

    const currentTask = await Task.findById(taskId);
    if (!currentTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const newCompletedStatus = completed !== undefined ? completed === 'true' : !currentTask.completed;

    const task = await Task.findByIdAndUpdate(
      taskId,
      { completed: newCompletedStatus },
      { new: true }
    );

    if (completeSubtasks === 'true') {
      await Task.updateMany(
        { parentTaskId: taskId },
        { completed: newCompletedStatus }
      );
    }

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

    const originalTask = await Task.findById(taskId);
    if (!originalTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const {
      name, assignee, priority, completionDate, channelId,
      description, completed, status, parentTaskId, attachments,
      userId
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

    try {
      const actorUserId = userId || updatedTask.createdBy || 'system';
      const updateDataWithActor = {
        ...updateData,
        actor: actorUserId,
        userId: actorUserId
      };
      await getStreamFeedsService.createTaskUpdateNotifications(originalTask, updatedTask, updateDataWithActor);
    } catch (error) {
      console.error('Error creating task update notifications:', error);
    }

    res.status(200).json({ status: 'success', task: updatedTask });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

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

    if (!task.parentTaskId) {
      await Task.deleteMany({ parentTaskId: taskId });
    }

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

    const uniqueFileName = `${Date.now()}-${file.originalname}`;
    const fileUrl = await uploadToS3(file.buffer, uniqueFileName, file.mimetype);

    const newAttachment = {
      uri: fileUrl,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
      commentId: req.body.commentId ? String(req.body.commentId) : null,
    };

    const updatedAttachments = [...(task.attachments || []), newAttachment];

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { attachments: updatedAttachments },
      { new: true }
    );

    try {
      const attachmentUserId = req.body?.userId || req.query?.userId as string || task.createdBy || 'system';
      const attachmentActorName = await getStreamFeedsService.getUserName(attachmentUserId);

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
          actor: attachmentUserId,
          actorName: attachmentActorName,
          channelId: task.channelId
        }
      });

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

router.delete('/:taskId/attachments/:attachmentIndex', async (req: Request, res: Response) => {
  try {
    const { taskId, attachmentIndex } = req.params;
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

    const removedAttachment = task.attachments[index];
    const updatedAttachments = task.attachments.filter((_, i) => i !== index);

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { attachments: updatedAttachments },
      { new: true }
    );

    try {
      const attachmentRemoveUserId = userId || 'system';
      const attachmentRemoveActorName = await getStreamFeedsService.getUserName(attachmentRemoveUserId);

      const tasksFeed = await getStreamFeedsService['getstreamClient'].feed('tasks', taskId);
      await tasksFeed.addActivity({
        actor: attachmentRemoveUserId,
        verb: 'task_attachment_removed',
        object: taskId,
        extra: {
          taskId: taskId,
          taskName: task.name,
          fileName: removedAttachment.name,
          actor: attachmentRemoveUserId,
          actorName: attachmentRemoveActorName,
          channelId: task.channelId
        }
      });

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

router.get('/:taskId/activities', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      res.status(400).json({ error: 'Task ID is required' });
      return;
    }

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
