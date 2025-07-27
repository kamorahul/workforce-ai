import express, { Request, Response, Router } from 'express';
import { Task } from '../models/Task';

export const handleTaskPost = async (req: Request, res: Response) => {
  try {
    const { name, assignee, priority, completionDate, channelId, description, subtasks } = req.body;
    if (!name || !assignee || !priority || !completionDate || !channelId) {
      res.status(400).json({ error: 'Missing required fields' });
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
    const { assignee, channelId } = req.query;
    if (!assignee) {
      res.status(400).json({ error: 'Missing required query parameter: assignee' });
      return;
    }
    const now = new Date();
    const query: any = {
      assignee: assignee as string,
    };
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

export default router; 