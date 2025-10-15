# Audio Upload API Documentation

## Overview
This API allows users to upload, retrieve, and manage audio files. It follows the same pattern as the profile upload API, using multer for file handling and AWS S3 for storage.

## Endpoints

### 1. Upload Audio File
**POST** `/upload/audio`

Upload an audio file to the server.

#### Request
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `userId` (string, required): User ID
  - `audioFile` (file, required): Audio file to upload
  - `title` (string, optional): Title for the audio file
  - `description` (string, optional): Description of the audio
  - `channelId` (string, optional): Associated channel ID
  - `messageId` (string, optional): Associated message ID

#### Supported Audio Formats
- All audio MIME types (`audio/*`)
- Maximum file size: 100MB

#### Response
```json
{
  "message": "Audio uploaded successfully.",
  "audio": {
    "id": "audio_1697123456789",
    "userId": "918168436126",
    "title": "Test Audio Recording",
    "description": "This is a test audio upload",
    "channelId": "messaging:test-channel",
    "messageId": null,
    "originalName": "recording.mp3",
    "fileName": "audio-918168436126-1697123456789.mp3",
    "fileUrl": "https://s3.amazonaws.com/bucket/onboard-lo/local/employeeDocs/audio-918168436126-1697123456789.mp3",
    "mimeType": "audio/mpeg",
    "fileSize": 2048576,
    "uploadedAt": "2023-10-13T10:30:00.000Z",
    "duration": null
  }
}
```

#### Error Responses
- `400 Bad Request`: Missing required fields or invalid file
- `500 Internal Server Error`: Upload failed

### 2. Get User Audio Files
**GET** `/upload/audio/:userId`

Retrieve audio files for a specific user.

#### Request
- **URL Parameters**:
  - `userId` (string, required): User ID
- **Query Parameters**:
  - `limit` (number, optional): Number of results to return (default: 50)
  - `offset` (number, optional): Number of results to skip (default: 0)

#### Response
```json
{
  "message": "Audio files retrieved successfully.",
  "userId": "918168436126",
  "audios": [],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 0
  }
}
```

### 3. Delete Audio File
**DELETE** `/upload/audio/:audioId`

Delete a specific audio file.

#### Request
- **URL Parameters**:
  - `audioId` (string, required): Audio file ID
- **Body**:
  - `userId` (string, required): User ID (for verification)

#### Response
```json
{
  "message": "Audio deleted successfully.",
  "audioId": "audio_1697123456789",
  "userId": "918168436126"
}
```

## Usage Examples

### JavaScript/Node.js
```javascript
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function uploadAudio() {
  const formData = new FormData();
  formData.append('userId', '918168436126');
  formData.append('title', 'Meeting Recording');
  formData.append('audioFile', fs.createReadStream('./recording.mp3'));
  
  const response = await fetch('https://api.convoe.ai/upload/audio', {
    method: 'POST',
    body: formData,
    headers: formData.getHeaders(),
  });
  
  const result = await response.json();
  console.log(result);
}
```

### cURL
```bash
curl -X POST https://api.convoe.ai/upload/audio \
  -F "userId=918168436126" \
  -F "title=Test Recording" \
  -F "description=This is a test audio" \
  -F "audioFile=@/path/to/audio.mp3"
```

### React Native
```javascript
const uploadAudio = async (audioUri, userId, title) => {
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('title', title);
  formData.append('audioFile', {
    uri: audioUri,
    type: 'audio/mpeg',
    name: 'recording.mp3',
  });
  
  try {
    const response = await fetch('https://api.convoe.ai/upload/audio', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

## File Storage

### S3 Configuration
- **Bucket**: Configured via `S3_BUCKET_NAME` environment variable
- **Path**: `onboard-lo/local/employeeDocs/`
- **Naming Convention**: `audio-{userId}-{timestamp}.{extension}`
- **Access**: Public read access

### File Organization
```
s3://bucket-name/
└── onboard-lo/
    └── local/
        └── employeeDocs/
            ├── audio-918168436126-1697123456789.mp3
            ├── audio-918168436126-1697123456790.wav
            └── ...
```

## Error Handling

### Common Errors
1. **Missing User ID**: `400 Bad Request`
2. **No Audio File**: `400 Bad Request`
3. **Invalid File Type**: `400 Bad Request` (non-audio files)
4. **File Too Large**: `413 Payload Too Large` (>100MB)
5. **S3 Upload Failed**: `500 Internal Server Error`

### Error Response Format
```json
{
  "error": "Error message description"
}
```

## Security Considerations

1. **File Type Validation**: Only audio files are accepted
2. **File Size Limits**: 100MB maximum file size
3. **User Verification**: Audio files are associated with specific users
4. **S3 Security**: Files are stored with public read access

## Future Enhancements

1. **Audio Metadata**: Extract duration, bitrate, etc.
2. **Audio Processing**: Convert to different formats
3. **Transcription**: Add speech-to-text functionality
4. **Database Storage**: Store audio metadata in MongoDB
5. **Access Control**: Implement proper user permissions

## Testing

Use the provided test script:
```bash
node test-audio-upload.js
```

Make sure to have a test audio file at `./test-audio.mp3` or update the path in the script.
