import express, { Request, Response, Router } from 'express';
import { Task } from '../models/Task';
import { Comment } from '../models/Comment';
import { getStreamFeedsService } from '../utils/getstreamFeedsService'

export const handleTaskPost = async (req: Request, res: Response) => {
  try {
    const { name, assignee, priority, completionDate, channelId, description, subtasks, createdBy, parentTaskId } = req.body;
    if (!name || !assignee || !Array.isArray(assignee) || assignee.length === 0 || !priority || !completionDate || !channelId) {
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
        await getStreamFeedsService.createTaskActivity(newSubtask._id as string, newSubtask);
        createdSubtasks.push(newSubtask);
      }
    }

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
    const { assignee, channelId, createdBy, isCompleted, includeSubtasks, parentTaskId } = req.query;
    if (!assignee && !createdBy) {
      res.status(400).json({ error: 'Missing required query parameter: assignee or createdBy' });
      return;
    }
    const now = new Date();
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

    const tasks = await Task.find(query).sort({ completionDate: 1 });

    // If includeSubtasks is true, fetch subtasks for each task
    if (includeSubtasks === 'true' && !parentTaskId) {
      const tasksWithSubtasks = await Promise.all(tasks.map(async (task) => {
        const subtasks = await Task.find({ parentTaskId: task._id });
        return {
          ...task.toObject(),
          subtasks,
        };
      }));
      res.status(200).json({ status: 'success', tasks: tasksWithSubtasks });
    } else {
      res.status(200).json({ status: 'success', tasks });
    }
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

    res.status(200).json({ 
      status: 'success', 
      task,
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
    const { completeSubtasks } = req.query;
    
    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }

    const task = await Task.findByIdAndUpdate(
      taskId,
      { completed: true },
      { new: true }
    );

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // If completeSubtasks is true, also complete all subtasks
    if (completeSubtasks === 'true') {
      await Task.updateMany(
        { parentTaskId: taskId },
        { completed: true }
      );
    }

    // Fetch updated subtasks if any were completed
    const subtasks = completeSubtasks === 'true' 
      ? await Task.find({ parentTaskId: taskId })
      : [];

    res.status(200).json({ 
      status: 'success', 
      task,
      subtasks: completeSubtasks === 'true' ? subtasks : undefined
    });
  } catch (error) {
    console.error('Error marking task as complete:', error);
    res.status(500).json({ error: 'Failed to mark task as complete' });
  }
});

router.put('/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }
    
    const { 
      name, assignee, priority, completionDate, channelId, 
      description, completed, parentTaskId 
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
    if (parentTaskId !== undefined) updateData.parentTaskId = parentTaskId;
    
    const task = await Task.findByIdAndUpdate(
      taskId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    res.status(200).json({ status: 'success', task });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

export default router;