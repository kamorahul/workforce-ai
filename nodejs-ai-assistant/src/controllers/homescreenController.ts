import express, { Request, Response, Router } from 'express';
import { Task } from '../models/Task';
import { getStreamFeedsService } from '../utils/getstreamFeedsService';

const router: Router = express.Router();

/**
 * GET /homescreen
 *
 * Optimized endpoint that returns all data needed for the HomeScreen in a SINGLE call.
 * This replaces multiple separate API calls:
 * - GET /task?assignee=X&createdBy=X (was called twice!)
 * - GET /task/:taskId/activities?limit=1 (was called 6 times!)
 *
 * Now: 1 API call instead of 8+
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const currentUser = userId as string;

    // Build query for tasks where user is assignee OR creator
    const query = {
      $or: [
        { assignee: { $in: [currentUser] } },
        { createdBy: currentUser }
      ],
      parentTaskId: { $exists: false } // Only top-level tasks
    };

    // Fetch tasks once (instead of twice!)
    const tasks = await Task.find(query)
      .select('_id name status priority completionDate channelId createdAt updatedAt createdBy assignee description completed')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    // Get today's date for filtering
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];

    // Filter tasks due today
    const tasksDueToday = tasks.filter(task => {
      if (!task.completionDate) return false;
      const dueDate = new Date(task.completionDate);
      const dueDateString = dueDate.toISOString().split('T')[0];
      return dueDateString === todayString;
    }).slice(0, 2);

    // If no tasks due today, show 2 most recent
    const tasksToShow = tasksDueToday.length > 0
      ? tasksDueToday
      : tasks.slice(0, 2);

    // Get subtask counts for tasks due today
    const tasksWithCounts = await Promise.all(tasksToShow.map(async (task) => {
      const subtaskStats = await Task.aggregate([
        { $match: { parentTaskId: task._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$completed', true] }, 1, 0] } }
          }
        }
      ]);
      const counts = subtaskStats[0] || { total: 0, completed: 0 };
      return {
        ...task,
        subtaskCounts: { total: counts.total, completed: counts.completed }
      };
    }));

    // Fetch activities for top 6 recent tasks IN PARALLEL (batch fetch)
    const recentTasks = tasks.slice(0, 6);
    const activitiesPromises = recentTasks.map(async (task) => {
      try {
        const taskId = task._id?.toString();
        if (!taskId) return null;

        const activities = await getStreamFeedsService.getTaskActivities(taskId, 1);
        if (!Array.isArray(activities) || activities.length === 0) return null;

        const activity = activities[0];
        return {
          taskId,
          taskName: task.name || 'Untitled Task',
          channelId: task.channelId,
          activity: {
            id: activity.id,
            verb: activity.verb,
            actor: activity.actor,
            time: activity.time,
            extra: activity.extra
          }
        };
      } catch (error) {
        console.error(`Error fetching activity for task ${task._id}:`, error);
        return null;
      }
    });

    const activitiesResults = (await Promise.all(activitiesPromises)).filter(Boolean);

    // Sort activities by time
    let sortedActivities = activitiesResults.sort((a: any, b: any) => {
      const dateA = new Date(a?.activity?.time || 0);
      const dateB = new Date(b?.activity?.time || 0);
      return dateB.getTime() - dateA.getTime();
    }).slice(0, 5); // Return top 5 activities

    // FALLBACK: If no GetStream activities found, create activities from recent tasks
    if (sortedActivities.length === 0 && tasks.length > 0) {
      sortedActivities = tasks.slice(0, 5).map((task) => {
        const taskId = task._id?.toString() || '';
        const taskName = task.name || 'Untitled Task';
        const assigneeId = task.assignee?.[0] || task.createdBy || 'Unknown';

        // Determine activity verb based on task status
        let verb = 'task_created';
        if (task.completed || task.status === 'completed') {
          verb = 'task_status_changed';
        } else if (task.status === 'in_progress') {
          verb = 'task_status_changed';
        }

        return {
          taskId,
          taskName,
          channelId: task.channelId,
          activity: {
            id: `fallback-${taskId}`,
            verb,
            actor: assigneeId,
            time: task.updatedAt || task.createdAt,
            extra: {
              actor: assigneeId,
              taskId,
              taskName,
              channelId: task.channelId,
              newStatus: task.status || (task.completed ? 'completed' : 'todo'),
              isFallback: true // Flag to indicate this is a fallback activity
            }
          }
        };
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        tasksDueToday: tasksWithCounts,
        recentActivities: sortedActivities,
        // Include metadata for client-side caching
        fetchedAt: new Date().toISOString(),
        totalTasks: tasks.length
      }
    });

  } catch (error) {
    console.error('Error in homescreen endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch homescreen data' });
  }
});

export default router;
