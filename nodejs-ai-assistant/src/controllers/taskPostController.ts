import express, { Request, Response, Router } from 'express';
import { Task } from '../models/Task';

export const handleTaskPost = async (req: Request, res: Response) => {
  try {
    const { name, assignee, priority, completionDate, channelId } = req.body;
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
      completionDate: { $gt: now },
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

export default router; 