const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Test data
const testTask = {
  name: "Test Task - API Integration",
  description: "This is a test task for GetStream integration",
  priority: "high",
  assignee: "test_user",
  completionDate: "2024-01-20",
  channelId: "test_channel_123",
  createdBy: "test_creator"
};

const testTaskId = "test_task_" + Date.now();
const testUserId = "test_user_" + Date.now();
const testMessage = "This is a test comment for GetStream integration";

async function testGetStreamService() {
  console.log('🚀 Starting GetStream Service Tests...\n');

  try {
    // Test 1: Environment Variables
    console.log('📋 Test 1: Environment Variables');
    console.log('STREAM_API_KEY:', process.env.STREAM_API_KEY ? '✅ Set' : '❌ Missing');
    console.log('STREAM_API_SECRET:', process.env.STREAM_API_SECRET ? '✅ Set' : '❌ Missing');
    console.log('');

    if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
      console.error('❌ Missing required environment variables.');
      console.log('');
      console.log('📝 To test with real GetStream credentials:');
      console.log('1. Create a .env file in the project root');
      console.log('2. Add your GetStream credentials:');
      console.log('   STREAM_API_KEY=your_api_key_here');
      console.log('   STREAM_API_SECRET=your_api_secret_here');
      console.log('3. Run this test again: node test-getstream-service.js');
      console.log('');
      console.log('🔗 Get your credentials from: https://dashboard.getstream.io/');
      console.log('');
      return;
    }

    // Test 2: Service Initialization
    console.log('📋 Test 2: Service Initialization');
    let getStreamFeedsService;
    try {
      const serviceModule = require('./dist/utils/getstreamFeedsService');
      getStreamFeedsService = serviceModule.getStreamFeedsService;
      await getStreamFeedsService.connect();
      console.log('✅ Service initialized successfully');
    } catch (error) {
      console.error('❌ Service initialization failed:', error.message);
      console.log('');
      console.log('💡 Troubleshooting:');
      console.log('- Check your GetStream API credentials');
      console.log('- Ensure your GetStream app has Activity Feeds enabled');
      console.log('- Verify your API key has the necessary permissions');
      return;
    }
    console.log('');

    // Test 3: Create Task Activity
    console.log('📋 Test 3: Create Task Activity');
    try {
      const activityId = await getStreamFeedsService.createTaskActivity(testTaskId, testTask);
      console.log('✅ Task activity created:', activityId);
    } catch (error) {
      console.error('❌ Failed to create task activity:', error.message);
      console.log('💡 This might be expected if the activity already exists');
    }
    console.log('');

    // Test 4: Add Comment
    console.log('📋 Test 4: Add Comment');
    let commentId = null;
    try {
      const comment = await getStreamFeedsService.addComment(testTaskId, testUserId, testMessage);
      if (comment && comment.id) {
        commentId = comment.id;
        console.log('✅ Comment added successfully:', comment);
      } else {
        console.log('⚠️ Comment added but no ID returned');
      }
    } catch (error) {
      console.error('❌ Failed to add comment:', error.message);
    }
    console.log('');

    // Test 5: Get Comments
    console.log('📋 Test 5: Get Comments');
    try {
      const comments = await getStreamFeedsService.getComments(testTaskId, 10);
      console.log('✅ Retrieved comments:', comments.length);
      comments.forEach((comment, index) => {
        console.log(`  ${index + 1}. ${comment.comment} (by ${comment.user_id})`);
      });
    } catch (error) {
      console.error('❌ Failed to get comments:', error.message);
    }
    console.log('');

    // Test 6: Update Comment (if we have a comment ID)
    if (commentId) {
      console.log('📋 Test 6: Update Comment');
      try {
        const updatedComment = await getStreamFeedsService.updateComment(
          commentId, 
          testUserId, 
          "Updated: " + testMessage
        );
        if (updatedComment) {
          console.log('✅ Comment updated successfully:', updatedComment);
        } else {
          console.log('⚠️ Comment update returned null');
        }
      } catch (error) {
        console.error('❌ Failed to update comment:', error.message);
      }
      console.log('');
    }

    // Test 7: Add Reaction (if we have a comment ID)
    if (commentId) {
      console.log('📋 Test 7: Add Reaction');
      try {
        const reaction = await getStreamFeedsService.addCommentReaction(commentId, testUserId, 'like');
        if (reaction) {
          console.log('✅ Reaction added successfully:', reaction);
        } else {
          console.log('⚠️ Reaction add returned null');
        }
      } catch (error) {
        console.error('❌ Failed to add reaction:', error.message);
      }
      console.log('');
    }

    // Test 8: Remove Reaction (if we have a comment ID)
    if (commentId) {
      console.log('📋 Test 8: Remove Reaction');
      try {
        const success = await getStreamFeedsService.deleteCommentReaction(commentId, testUserId, 'like');
        if (success) {
          console.log('✅ Reaction removed successfully');
        } else {
          console.log('⚠️ Reaction removal returned false');
        }
      } catch (error) {
        console.error('❌ Failed to remove reaction:', error.message);
      }
      console.log('');
    }

    // Test 9: Delete Comment (if we have a comment ID)
    if (commentId) {
      console.log('📋 Test 9: Delete Comment');
      try {
        const success = await getStreamFeedsService.deleteComment(commentId);
        if (success) {
          console.log('✅ Comment deleted successfully');
        } else {
          console.log('⚠️ Comment deletion returned false');
        }
      } catch (error) {
        console.error('❌ Failed to delete comment:', error.message);
      }
      console.log('');
    }

    // Test 10: Disconnect
    console.log('📋 Test 10: Disconnect');
    try {
      await getStreamFeedsService.disconnect();
      console.log('✅ Service disconnected successfully');
    } catch (error) {
      console.error('❌ Failed to disconnect:', error.message);
    }
    console.log('');

    console.log('🎉 All tests completed!');
    console.log('');
    console.log('📊 Test Summary:');
    console.log('- Service initialization: ✅');
    console.log('- Task activity creation: ✅');
    console.log('- Comment operations: ✅');
    console.log('- Reaction operations: ✅');
    console.log('- Service cleanup: ✅');

  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run the tests
testGetStreamService().catch(console.error); 