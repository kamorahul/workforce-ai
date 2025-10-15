// Test script for audio upload API
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testAudioUpload() {
  try {
    // Create form data
    const formData = new FormData();
    
    // Add required fields
    formData.append('userId', '918168436126');
    formData.append('title', 'Test Audio Recording');
    formData.append('description', 'This is a test audio upload');
    formData.append('channelId', 'messaging:test-channel');
    
    // Add audio file (you would replace this with actual audio file path)
    // For testing, you can create a dummy audio file or use an existing one
    const audioFilePath = './test-audio.mp3'; // Replace with actual audio file
    
    // Check if audio file exists
    if (fs.existsSync(audioFilePath)) {
      formData.append('audioFile', fs.createReadStream(audioFilePath));
    } else {
      console.log('❌ Audio file not found. Please create a test audio file or update the path.');
      console.log('Expected file: ' + audioFilePath);
      return;
    }

    // Make the request
    console.log('🚀 Uploading audio file...');
    const response = await fetch('https://api.convoe.ai/upload/audio', {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders(),
      },
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Audio uploaded successfully!');
      console.log('📁 Audio details:', JSON.stringify(result.audio, null, 2));
    } else {
      console.log('❌ Upload failed:', result);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Test getting audio files
async function testGetAudioFiles() {
  try {
    console.log('📋 Fetching audio files...');
    const response = await fetch('https://api.convoe.ai/upload/audio/918168436126');
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Audio files retrieved successfully!');
      console.log('📁 Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ Failed to retrieve audio files:', result);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run tests
console.log('🎵 Audio Upload API Test');
console.log('========================');

// Uncomment the test you want to run:
// testAudioUpload();
testGetAudioFiles();
