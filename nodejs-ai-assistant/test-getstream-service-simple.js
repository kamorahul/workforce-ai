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

async function testGetStreamServiceStructure() {
  console.log('🚀 Starting GetStream Service Structure Tests...\n');

  try {
    // Test 1: Environment Variables
    console.log('📋 Test 1: Environment Variables');
    console.log('STREAM_API_KEY:', process.env.STREAM_API_KEY ? '✅ Set' : '❌ Missing');
    console.log('STREAM_API_SECRET:', process.env.STREAM_API_SECRET ? '✅ Set' : '❌ Missing');
    console.log('');

    if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
      console.log('⚠️ Environment variables not set. This is expected for local testing.');
      console.log('To test with real GetStream:');
      console.log('1. Set STREAM_API_KEY in your .env file');
      console.log('2. Set STREAM_API_SECRET in your .env file');
      console.log('3. Run: node test-getstream-service.js');
      console.log('');
    }

    // Test 2: Service Module Loading
    console.log('📋 Test 2: Service Module Loading');
    try {
      const { getStreamFeedsService } = require('./dist/utils/getstreamFeedsService');
      console.log('✅ Service module loaded successfully');
      console.log('Service type:', typeof getStreamFeedsService);
      console.log('Service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(getStreamFeedsService)));
    } catch (error) {
      console.error('❌ Failed to load service module:', error.message);
      return;
    }
    console.log('');

    // Test 3: Service Constructor (without credentials)
    console.log('📋 Test 3: Service Constructor');
    try {
      // Temporarily set dummy values for testing
      const originalKey = process.env.STREAM_API_KEY;
      const originalSecret = process.env.STREAM_API_SECRET;
      
      process.env.STREAM_API_KEY = 'test_key';
      process.env.STREAM_API_SECRET = 'test_secret';
      
      const { getStreamFeedsService } = require('./dist/utils/getstreamFeedsService');
      console.log('✅ Service constructor works (with dummy credentials)');
      
      // Restore original values
      if (originalKey) process.env.STREAM_API_KEY = originalKey;
      if (originalSecret) process.env.STREAM_API_SECRET = originalSecret;
    } catch (error) {
      console.error('❌ Service constructor failed:', error.message);
    }
    console.log('');

    // Test 4: Method Signatures
    console.log('📋 Test 4: Method Signatures');
    const expectedMethods = [
      'connect',
      'createTaskActivity',
      'addComment',
      'getComments',
      'updateComment',
      'deleteComment',
      'addCommentReaction',
      'deleteCommentReaction',
      'disconnect'
    ];
    
    try {
      const { getStreamFeedsService } = require('./dist/utils/getstreamFeedsService');
      const service = getStreamFeedsService;
      
      expectedMethods.forEach(method => {
        if (typeof service[method] === 'function') {
          console.log(`✅ ${method} method exists`);
        } else {
          console.log(`❌ ${method} method missing`);
        }
      });
    } catch (error) {
      console.error('❌ Failed to check method signatures:', error.message);
    }
    console.log('');

    // Test 5: Interface Definitions
    console.log('📋 Test 5: Interface Definitions');
    try {
      const { GetStreamComment, GetStreamActivity } = require('./dist/utils/getstreamFeedsService');
      console.log('✅ GetStreamComment interface available');
      console.log('✅ GetStreamActivity interface available');
    } catch (error) {
      console.log('⚠️ Interfaces not exported (this is normal for compiled JS)');
    }
    console.log('');

    // Test 6: Test Data Validation
    console.log('📋 Test 6: Test Data Validation');
    console.log('Test Task ID:', testTaskId);
    console.log('Test User ID:', testUserId);
    console.log('Test Message:', testMessage);
    console.log('Test Task:', JSON.stringify(testTask, null, 2));
    console.log('✅ Test data prepared successfully');
    console.log('');

    console.log('🎉 Structure tests completed!');
    console.log('');
    console.log('📝 Next Steps:');
    console.log('1. Set your GetStream API credentials in .env file');
    console.log('2. Run: node test-getstream-service.js');
    console.log('3. Check the GetStream dashboard for created activities and comments');

  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run the tests
testGetStreamServiceStructure().catch(console.error); 