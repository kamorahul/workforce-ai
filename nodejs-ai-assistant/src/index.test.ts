import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { serverClient } from './serverClient'; // To mock its methods
import * as utils from './utils'; // To mock getTimezoneFromCoordinates
import ProjectDetailsModel from './models/Project'; // This will be the mock constructor after jest.mock
import { connectDB } from './config/mongodb';
import { app } from './index'; // Import the app from index.ts

// Mock dependencies
jest.mock('./serverClient', () => {
  const mockChannelInstance = {
    create: jest.fn().mockResolvedValue({}),
    addMembers: jest.fn().mockResolvedValue({}),
    hide: jest.fn().mockResolvedValue({}),
    sendMessage: jest.fn().mockResolvedValue({ message: { id: 'test-message-id' } }),
    watch: jest.fn().mockResolvedValue({}),
    state: { messages: [] },
  };
  return {
    serverClient: {
      createToken: jest.fn().mockReturnValue('mock_token'),
      upsertUser: jest.fn().mockResolvedValue({}),
      channel: jest.fn().mockImplementation((type, id, data) => mockChannelInstance),
      queryUsers: jest.fn().mockResolvedValue({ users: [{ id: 'test-user', name: 'Test User' }] }),
      deleteMessage: jest.fn().mockResolvedValue({}),
      queryChannels: jest.fn().mockResolvedValue([]),
    },
    apiKey: 'mock_api_key',
  };
});

jest.mock('./utils', () => {
  const originalUtils = jest.requireActual('./utils');
  return {
    ...originalUtils,
    getTimezoneFromCoordinates: jest.fn(),
  };
});

const mockProjectDetailsSave = jest.fn();
jest.mock('./models/Project', () => {
  return jest.fn().mockImplementation(() => ({
    save: mockProjectDetailsSave,
  }));
});

const MockedProjectDetailsModel = ProjectDetailsModel as unknown as jest.Mock;

describe('/channel-join API Endpoint', () => {
  // let consoleErrorSpy: jest.SpyInstance; // Moved into the specific test that needs it

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI_TEST;
    if (!mongoUri) {
      throw new Error('MONGODB_URI_TEST is not set. Check jest.setup.js');
    }
    await connectDB(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    MockedProjectDetailsModel.mockClear();
    mockProjectDetailsSave.mockClear();

    (utils.getTimezoneFromCoordinates as jest.Mock).mockReturnValue('America/New_York');

    MockedProjectDetailsModel.mockImplementation(() => ({
      save: mockProjectDetailsSave.mockResolvedValue({}),
    }));

    // Setup console.error spy
    // consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // Moved
  });

  afterEach(() => {
    // Restore console.error spy
    // if (consoleErrorSpy) { // Moved
    //   consoleErrorSpy.mockRestore();
    // }
  });

  describe('New Channel Creation (isNewChannel: true)', () => {
    const projectData = {
      projectId: 'test-project-123',
      projectName: 'Test Project',
      email: 'test@example.com',
      location: {
        type: 'Point' as 'Point',
        coordinates: [-73.935242, 40.730610],
      },
      projectDetails: {
        description: 'A test project description.',
        startTime: new Date('2024-01-01T09:00:00.000Z'),
        endTime: new Date('2024-12-31T17:00:00.000Z'),
        timeSheetRequirement: true,
        swms: 'SWMS details here',
      },
      qrCode: 'test-qr-code',
    };

    const requestBody = {
      isNewChannel: true,
      projectData,
      username: 'testuser',
    };

    it('should successfully create a channel and save project details', async () => {
      const expectedChannelId = `test-project-${utils.convertEmailToStreamFormat(projectData.email)}`;
      mockProjectDetailsSave.mockResolvedValue({ _id: 'mockMongoId', ...projectData });

      const response = await request(app)
        .post('/channel-join')
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.channelId).toBe(expectedChannelId);

      expect(serverClient.channel).toHaveBeenCalledWith('messaging', expectedChannelId, expect.objectContaining({
        name: projectData.projectName,
        projectId: projectData.projectId,
        created_by_id: utils.convertEmailToStreamFormat(projectData.email),
      }));
      const mockChannelInstance = (serverClient.channel as jest.Mock).mock.results[0].value;
      expect(mockChannelInstance.create).toHaveBeenCalled();

      expect(utils.getTimezoneFromCoordinates).toHaveBeenCalledWith(projectData.location.coordinates[1], projectData.location.coordinates[0]);

      expect(MockedProjectDetailsModel).toHaveBeenCalledTimes(1);
      expect(mockProjectDetailsSave).toHaveBeenCalledTimes(1);

      const constructorArgs = MockedProjectDetailsModel.mock.calls[0][0];
      expect(constructorArgs).toEqual(expect.objectContaining({
        projectId: projectData.projectId,
        projectName: projectData.projectName,
        email: projectData.email,
        location: projectData.location,
        description: projectData.projectDetails.description,
        startTime: projectData.projectDetails.startTime, // Dates are now passed as Date objects
        endTime: projectData.projectDetails.endTime,     // Dates are now passed as Date objects
        timeSheetRequirement: projectData.projectDetails.timeSheetRequirement,
        swms: projectData.projectDetails.swms,
        qrCode: projectData.qrCode,
        timezone: 'America/New_York',
        channelId: expectedChannelId,
      }));
      // No need for separate ISO string checks if direct Date object comparison works
      // expect(new Date(constructorArgs.startTime).toISOString()).toBe(projectData.projectDetails.startTime.toISOString());
      // expect(new Date(constructorArgs.endTime).toISOString()).toBe(projectData.projectDetails.endTime.toISOString());
    });

    it('should save ProjectDetails with "UTC" timezone if getTimezoneFromCoordinates returns "UTC"', async () => {
      (utils.getTimezoneFromCoordinates as jest.Mock).mockReturnValue('UTC');

      await request(app)
        .post('/channel-join')
        .send(requestBody);

      expect(mockProjectDetailsSave).toHaveBeenCalledTimes(1);
      const constructorArgs = MockedProjectDetailsModel.mock.calls[0][0];
      expect(constructorArgs.timezone).toBe('UTC');
    });

    it('should return 200 but log an error if ProjectDetails.save() fails', async () => {
      // Ensure this mock is specific to this test and does not affect others.
      mockProjectDetailsSave.mockRejectedValueOnce(new Error('Simulated DB save error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const expectedChannelId = `test-project-${utils.convertEmailToStreamFormat(projectData.email)}`;

      const response = await request(app)
        .post('/channel-join')
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success'); // Verify response body as per successful channel creation
      expect(response.body.channelId).toBe(expectedChannelId);

      expect(mockProjectDetailsSave).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Error saving ProjectDetails for projectId: ${projectData.projectId}, channelId: ${expectedChannelId}`),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
