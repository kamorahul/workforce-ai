import express, { Request, Response, Router } from 'express';
import { Comment } from '../models/Comment';
import { Task } from '../models/Task';
import { getStreamFeedsService } from '../utils/getstreamFeedsService';

const router: Router = express.Router();



// Post comment on task
router.post('/:taskId/comments', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { userId, message } = req.body;

    if (!taskId || !userId || !message) {
      res.status(400).json({ error: 'Missing required fields: taskId, userId, or message' });
      return;
    }

    // Verify task exists
    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Create comment in database first
    const comment = new Comment({
      taskId,
      userId,
      message,
    });
    await comment.save();

    // Add comment to GetStream Activity Feeds
    let getstreamComment: any = null;
    try {
      getstreamComment = await getStreamFeedsService.addComment(
        taskId,
        userId,
        message,
        (comment._id as any).toString()
      );

      // Update database comment with GetStream ID if successful
      if (getstreamComment && getstreamComment.id) {
        comment.getstreamCommentId = getstreamComment.id;
        await comment.save();
      }
    } catch (error) {
      console.error('Error adding comment to GetStream:', error);
      // Continue even if GetStream fails - we have the comment in database
    }

    res.status(201).json({ 
      status: 'success', 
      comment: {
        ...comment.toObject(),
        getstreamComment
      }
    });
  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Get comments for a task
router.get('/:taskId/comments', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;


    if (!taskId) {
      res.status(400).json({ error: 'Missing required parameter: taskId' });
      return;
    }

    // Verify task exists
    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Try to get comments from GetStream first
    let getstreamComments: any[] = [];
    try {
      getstreamComments = await getStreamFeedsService.getComments(
        taskId,
        50
      );
    } catch (error) {
      console.error('Error fetching comments from GetStream:', error);
      // Fall back to database comments
    }

    // If GetStream comments are available, use them
    if (getstreamComments && getstreamComments.length > 0) {
      const formattedComments = getstreamComments.map((comment: any) => ({
        _id: comment.custom?.commentId || comment.id,
        taskId: taskId,
        userId: comment.user_id,
        message: comment.comment,
        getstreamCommentId: comment.id,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
      }));

      res.status(200).json({ 
        status: 'success', 
        comments: formattedComments,
        source: 'getstream'
      });
    } else {
      // Fall back to database comments
      const comments = await Comment.find({ taskId }).sort({ createdAt: 1 });
      res.status(200).json({ 
        status: 'success', 
        comments,
        source: 'database'
      });
    }
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Update comment
router.put('/:taskId/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const { taskId, commentId } = req.params;
    const { message, userId } = req.body;

    if (!taskId || !commentId || !message || !userId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Verify task exists
    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Update comment in database
    const comment = await Comment.findByIdAndUpdate(
      commentId,
      { message },
      { new: true }
    );

    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    // Update comment in GetStream if it has a GetStream ID
    let getstreamComment: any = null;
    if (comment.getstreamCommentId) {
      try {
        getstreamComment = await getStreamFeedsService.updateComment(
          comment.getstreamCommentId,
          userId,
          message
        );
      } catch (error) {
        console.error('Error updating comment in GetStream:', error);
        // Continue even if GetStream update fails
      }
    }

    res.status(200).json({ 
      status: 'success', 
      comment: {
        ...comment.toObject(),
        getstreamComment
      }
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// Delete comment
router.delete('/:taskId/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const { taskId, commentId } = req.params;
    const { userId } = req.body;

    if (!taskId || !commentId || !userId) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    // Verify task exists
    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Get comment before deletion to check for GetStream ID
    const comment = await Comment.findById(commentId);
    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    // Delete comment from GetStream if it has a GetStream ID
    if (comment.getstreamCommentId) {
      try {
        await getStreamFeedsService.deleteComment(
          comment.getstreamCommentId
        );
      } catch (error) {
        console.error('Error deleting comment from GetStream:', error);
        // Continue even if GetStream deletion fails
      }
    }

    // Delete comment from database
    await Comment.findByIdAndDelete(commentId);

    res.status(200).json({ 
      status: 'success', 
      message: 'Comment deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Add reaction to comment
router.post('/:taskId/comments/:commentId/reactions', async (req: Request, res: Response) => {
  try {
    const { taskId, commentId } = req.params;
    const { userId, type } = req.body;

    if (!taskId || !commentId || !userId || !type) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Verify task exists
    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Get comment to check for GetStream ID
    const comment = await Comment.findById(commentId);
    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    // Add reaction in GetStream if comment has a GetStream ID
    let reaction: any = null;
    if (comment.getstreamCommentId) {
      try {
        reaction = await getStreamFeedsService.addCommentReaction(
          comment.getstreamCommentId,
          userId,
          type
        );
      } catch (error) {
        console.error('Error adding reaction to GetStream:', error);
      }
    }

    res.status(200).json({ 
      status: 'success', 
      reaction 
    });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Remove reaction from comment
router.delete('/:taskId/comments/:commentId/reactions', async (req: Request, res: Response) => {
  try {
    const { taskId, commentId } = req.params;
    const { userId, type } = req.body;

    if (!taskId || !commentId || !userId || !type) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Verify task exists
    const task = await Task.findById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Get comment to check for GetStream ID
    const comment = await Comment.findById(commentId);
    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    // Remove reaction from GetStream if comment has a GetStream ID
    let success = false;
    if (comment.getstreamCommentId) {
      try {
        success = await getStreamFeedsService.deleteCommentReaction(
          comment.getstreamCommentId,
          userId,
          type
        );
      } catch (error) {
        console.error('Error removing reaction from GetStream:', error);
      }
    }

    res.status(200).json({ 
      status: 'success', 
      message: 'Reaction removed successfully',
      success 
    });
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

export default router; 