// Jest setup file
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI_TEST = mongoUri; // Use a specific env var for test URI

  // It's often better to connect to MongoDB here once,
  // rather than in each test file or through the app's main connection logic,
  // especially if your app's connectDB doesn't easily allow overriding the URI for tests.
  // However, the provided app structure uses a connectDB function.
  // We'll assume connectDB can be called multiple times or is idempotent,
  // or that it checks mongoose.connection.readyState.
  // For simplicity here, we'll just set the URI. The app's connectDB will be called by the test.
  // If connectDB in the app initializes mongoose.connect(), it should pick up this URI
  // if it's designed to use process.env.MONGODB_URI or a passed argument.
  // For this setup, we'll ensure mongoose is disconnected before connecting to the test server.
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  // console.log(`Mock MongoDB URI: ${mongoUri}`); // For debugging
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
  // console.log('Mock MongoDB stopped.'); // For debugging
});

// You might want to clear all mock data from the DB between tests
// if your tests are not independent regarding DB state.
// For example, by clearing collections:
// afterEach(async () => {
//   const collections = mongoose.connection.collections;
//   for (const key in collections) {
//     const collection = collections[key];
//     await collection.deleteMany({});
//   }
// });
