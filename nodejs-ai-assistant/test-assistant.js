const axios = require('axios');

// Test the webhook endpoint
async function testWebhook() {
  try {
    console.log('Testing webhook endpoint...');
    
    const testData = {
      message: {
        text: "I have a meeting tomorrow at 2pm with the marketing team",
        attachments: []
      },
      user: {
        id: "test_user",
        name: "Test User",
        role: "user",
        created_at: new Date(),
        updated_at: new Date(),
        last_active: new Date(),
        last_engaged_at: new Date(),
        banned: false,
        online: true,
        image: ""
      },
      channel: {
        id: "kai_test_channel",
        type: "messaging"
      }
    };

    const response = await axios.post('http://localhost:3000/webhook', testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

// Test environment variables
function checkEnvironment() {
  console.log('=== Environment Check ===');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'Missing');
  console.log('OPENAI_ASSISTANT_ID:', process.env.OPENAI_ASSISTANT_ID || 'Using default');
  console.log('STREAM_API_KEY:', process.env.STREAM_API_KEY ? 'Set' : 'Missing');
  console.log('STREAM_API_SECRET:', process.env.STREAM_API_SECRET ? 'Set' : 'Missing');
  console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Missing');
}

// Test assistant ID
async function testAssistantId() {
  try {
    console.log('\n=== Testing Assistant ID ===');
    const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_Q8vD9YOGcO3es62kFjeVZI5L";
    
    const response = await axios.get(`https://api.openai.com/v1/assistants/${assistantId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'
      }
    });
    
    console.log('Assistant found:', response.data.id);
    console.log('Assistant name:', response.data.name);
    
  } catch (error) {
    console.error('Assistant test failed:', error.response?.data || error.message);
  }
}

// Run tests
async function runTests() {
  console.log('Starting assistant integration tests...\n');
  
  checkEnvironment();
  await testAssistantId();
  await testWebhook();
  
  console.log('\nTests completed.');
}

// Run if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testWebhook, checkEnvironment, testAssistantId }; 