import express, { Request, Response, Router } from 'express';
import { Task } from '../models/Task';
import { getStreamFeedsService } from '../utils/getstreamFeedsService';

const router: Router = express.Router();

/**
 * Activity types for filtering
 */
const ACTIVITY_TYPES = {
  ALL: 'all',
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_STATUS: 'task_status_changed',
  TASK_COMPLETED: 'task_completed',
  COMMENT: 'comment_added',
  ATTACHMENT: 'task_attachment_added',
  PRIORITY: 'task_priority_changed',
  DATE: 'task_date_changed',
};

/**
 * GET /teamactivity
 *
 * Dedicated endpoint for Team Activity screen with filtering and pagination.
 *
 * Query Parameters:
 * - userId (required): Current user ID
 * - limit (optional): Number of activities to return (default: 20, max: 50)
 * - offset (optional): Pagination offset (default: 0)
 * - filter (optional): Activity type filter - 'all', 'task_created', 'task_assigned',
 *                      'task_status_changed', 'comment_added', 'task_attachment_added',
 *                      'task_priority_changed', 'task_date_changed'
 * - excludeSelf (optional): Exclude current user's activities (default: true)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      limit = '20',
      offset = '0',
      filter = 'all',
      excludeSelf = 'true'
    } = req.query;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const currentUser = userId as string;
    const limitNum = Math.min(parseInt(limit as string) || 20, 50);
    const offsetNum = parseInt(offset as string) || 0;
    const filterType = filter as string;
    const shouldExcludeSelf = excludeSelf === 'true';

    // Build query for tasks where user is assignee OR creator
    const query = {
      $or: [
        { assignee: { $in: [currentUser] } },
        { createdBy: currentUser }
      ],
      parentTaskId: { $exists: false } // Only top-level tasks
    };

    // Fetch more tasks to get more activities
    const tasks = await Task.find(query)
      .select('_id name status priority completionDate channelId createdAt updatedAt createdBy assignee description completed')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(100)
      .lean();

    // Fetch activities for all tasks IN PARALLEL
    const activitiesPromises = tasks.map(async (task) => {
      try {
        const taskId = task._id?.toString();
        if (!taskId) return [];

        // Get more activities per task for better filtering
        const activities = await getStreamFeedsService.getTaskActivities(taskId, 10);
        if (!Array.isArray(activities) || activities.length === 0) return [];

        return activities.map(activity => ({
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
        }));
      } catch (error) {
        console.error(`Error fetching activities for task ${task._id}:`, error);
        return [];
      }
    });

    const allActivitiesNested = await Promise.all(activitiesPromises);
    let allActivities = allActivitiesNested.flat();

    // Apply filter by activity type
    if (filterType && filterType !== 'all') {
      allActivities = allActivities.filter((item: any) => {
        const verb = item.activity?.verb;

        switch (filterType) {
          case 'task_created':
            return verb === 'task_created';
          case 'task_assigned':
            return verb === 'task_assigned' || verb === 'task_assignee_changed';
          case 'task_status_changed':
            return verb === 'task_status_changed' || verb === 'subtask_status_changed';
          case 'task_completed':
            return verb === 'task_status_changed' &&
                   (item.activity?.extra?.newStatus === 'completed' ||
                    item.activity?.extra?.newStatus === 'done');
          case 'comment_added':
            return verb === 'comment_added';
          case 'task_attachment_added':
            return verb === 'task_attachment_added' || verb === 'task_attachment_removed';
          case 'task_priority_changed':
            return verb === 'task_priority_changed';
          case 'task_date_changed':
            return verb === 'task_date_changed';
          default:
            return true;
        }
      });
    }

    // Exclude current user's activities if requested
    if (shouldExcludeSelf) {
      const currentUserLower = currentUser.toLowerCase();
      allActivities = allActivities.filter((item: any) => {
        const actorId = item.activity?.actor || item.activity?.extra?.actor || '';
        const actorLower = actorId.toString().trim().toLowerCase();

        // Skip system activities
        if (!actorLower || actorLower === 'system') return false;

        // Exclude if actor is current user
        return !actorLower.includes(currentUserLower) &&
               actorLower !== currentUserLower;
      });
    }

    // Sort all activities by time (newest first)
    allActivities.sort((a: any, b: any) => {
      const dateA = new Date(a?.activity?.time || 0);
      const dateB = new Date(b?.activity?.time || 0);
      return dateB.getTime() - dateA.getTime();
    });

    // Remove duplicates based on activity ID
    const uniqueActivities = allActivities.filter((item: any, index: number, self: any[]) =>
      index === self.findIndex((t: any) => t.activity?.id === item.activity?.id)
    );

    // Get total count before pagination
    const total = uniqueActivities.length;

    // Apply pagination
    const paginatedActivities = uniqueActivities.slice(offsetNum, offsetNum + limitNum);

    // FALLBACK: If no activities found, create activities from recent tasks
    let finalActivities = paginatedActivities;
    if (finalActivities.length === 0 && offsetNum === 0 && tasks.length > 0) {
      finalActivities = tasks
        .filter(task => {
          if (!shouldExcludeSelf) return true;
          const creatorLower = (task.createdBy || '').toLowerCase();
          const assignees = (task.assignee || []).map((a: string) => a.toLowerCase());
          const currentUserLower = currentUser.toLowerCase();
          return creatorLower !== currentUserLower && !assignees.includes(currentUserLower);
        })
        .slice(0, limitNum)
        .map((task) => {
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
                isFallback: true
              }
            }
          };
        });
    }

    res.status(200).json({
      status: 'success',
      data: {
        activities: finalActivities,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: total,
          hasMore: offsetNum + limitNum < total
        },
        filters: {
          current: filterType,
          available: Object.values(ACTIVITY_TYPES)
        },
        fetchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in teamactivity endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch team activities' });
  }
});

/**
 * GET /teamactivity/filters
 *
 * Returns available filter options for the Team Activity screen
 */
router.get('/filters', async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    data: {
      filters: [
        { id: 'all', label: 'All Activity', icon: 'list' },
        { id: 'task_created', label: 'Tasks Created', icon: 'plus' },
        { id: 'task_assigned', label: 'Assignments', icon: 'person' },
        { id: 'task_status_changed', label: 'Status Changes', icon: 'refresh' },
        { id: 'task_completed', label: 'Completed', icon: 'checkmark' },
        { id: 'comment_added', label: 'Comments', icon: 'chat' },
        { id: 'task_attachment_added', label: 'Files', icon: 'attach' },
        { id: 'task_priority_changed', label: 'Priority Changes', icon: 'flag' },
        { id: 'task_date_changed', label: 'Date Changes', icon: 'calendar' },
      ]
    }
  });
});

export default router;
