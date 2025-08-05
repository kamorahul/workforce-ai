const axios = require('axios');

// Mock test data
const mockTaskId = '65f123456789012345678901';
const mockAttachment = {
    uri: 'https://example.com/test.pdf',
    name: 'test.pdf',
    type: 'application/pdf',
    size: 1024
};

// Test attachment endpoints
async function testAttachmentEndpoints() {
    console.log('Testing Attachment Endpoints...\n');

    try {
        // Test 1: Add attachment
        console.log('1. Testing POST /task/:taskId/attachments');
        const addResponse = await axios.post(`http://localhost:3000/task/${mockTaskId}/attachments`, {
            attachments: [mockAttachment]
        });
        console.log('✅ Add attachment successful:', addResponse.data);

        // Test 2: Remove attachment
        console.log('\n2. Testing DELETE /task/:taskId/attachments/:attachmentIndex');
        const removeResponse = await axios.delete(`http://localhost:3000/task/${mockTaskId}/attachments/0`);
        console.log('✅ Remove attachment successful:', removeResponse.data);

        console.log('\n🎉 All attachment tests passed!');

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ Server not running. Please start the server first.');
            console.log('Run: npm start');
        } else {
            console.log('❌ Test failed:', error.response?.data || error.message);
        }
    }
}

// Run tests
testAttachmentEndpoints(); 