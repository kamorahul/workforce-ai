import express, { Request, Response, Router } from 'express';
import { Task } from '../models/Task';
import { Comment } from '../models/Comment';

export const handleTaskPost = async (req: Request, res: Response) => {
  try {
    const { name, assignee, priority, completionDate, channelId, description, subtasks, createdBy } = req.body;
    if (!name || !assignee || !Array.isArray(assignee) || assignee.length === 0 || !priority || !completionDate || !channelId) {
      res.status(400).json({ error: 'Missing required fields or assignee must be a non-empty array' });
      return;
    }
    const task = new Task({
      name,
      assignee,
      priority,
      completionDate: new Date(completionDate),
      channelId,
      description,
      subtasks: subtasks || [],
      createdBy: createdBy || assignee[0], // Use first assignee as default creator
    });
    await task.save();
    res.status(201).json({ status: 'success', task });
  } catch (error) {
    console.error('Error saving task:', error);
    res.status(500).json({ error: 'Failed to save task' });
  }
};

const router: Router = express.Router();
router.post('/', handleTaskPost);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { assignee, channelId, createdBy } = req.query;
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
    const tasks = await Task.find(query).sort({ completionDate: 1 });
    res.status(200).json({ status: 'success', tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get task details with comments
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

    res.status(200).json({ 
      status: 'success', 
      task,
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

    res.status(200).json({ status: 'success', task });
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
    
    const { name, assignee, priority, completionDate, channelId, description, subtasks, completed } = req.body;
    
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
    if (subtasks !== undefined) updateData.subtasks = subtasks;
    if (completed !== undefined) updateData.completed = completed;
    
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