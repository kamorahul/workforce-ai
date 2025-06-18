import { Request, Response } from 'express';
import { handleAttendancePost } from '../../controllers/attendancePostController'; // Adjusted import
import { ProjectDetails } from '../../models/Project';
import { Attendance } from '../../models/Attendance';
import { AttendanceLog } from '../../models/AttendanceLog';
import { serverClient } from '../../serverClient';

// Mock dependencies
jest.mock('../../models/Project');
jest.mock('../../models/Attendance');
jest.mock('../../models/AttendanceLog');
jest.mock('../../serverClient');

describe('Attendance Post Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: any;
  let responseStatus: number;

  beforeEach(() => {
    responseJson = {};
    responseStatus = 0;
    mockRequest = {
      body: {
        userId: 'testUser',
        projectId: 'testProject',
        datetime: '2023-10-27T10:00:00.000Z', // UTC time
        status: 'checkin',
        messageId: 'testMessageId',
        projectName: 'Test Project Name'
      },
    };
    mockResponse = {
      status: jest.fn().mockImplementation((status) => {
        responseStatus = status;
        return {
          json: jest.fn().mockImplementation((json) => {
            responseJson = json;
          }),
        };
      }),
      json: jest.fn().mockImplementation((json) => {
        responseJson = json;
      }),
    };

    // Reset mocks
    (ProjectDetails.findById as jest.Mock).mockReset();
    (Attendance.prototype.save as jest.Mock).mockReset();
    (AttendanceLog.prototype.save as jest.Mock).mockReset();
    (serverClient.deleteMessage as jest.Mock).mockReset();
    const channelMock = {
        sendMessage: jest.fn().mockResolvedValue({ message: { id: 'newMessageId' } })
    };
    (serverClient.channel as jest.Mock).mockReturnValue(channelMock);

    // Default mock implementations
    (Attendance.prototype.save as jest.Mock).mockResolvedValue({});
    (AttendanceLog.prototype.save as jest.Mock).mockResolvedValue({});
    (serverClient.deleteMessage as jest.Mock).mockResolvedValue({});
  });

  test('should send message with project-specific timezone', async () => {
    (ProjectDetails.findById as jest.Mock).mockResolvedValue({
      _id: 'testProject',
      timezone: 'America/New_York', // EDT: UTC-4
    });

    await handleAttendancePost(mockRequest as Request, mockResponse as Response);

    expect(serverClient.channel).toHaveBeenCalledWith("messaging", `tai_testUser`);
    const sendMessageCall = (serverClient.channel("messaging", `tai_testUser`).sendMessage as jest.Mock).mock.calls[0][0];

    // Original datetime: 2023-10-27T10:00:00.000Z
    // Expected in America/New_York (EDT): October 27, 2023 at 6:00 AM
    expect(sendMessageCall.text).toContain('Checkin Done for project Test Project Name at October 27, 2023');
    // Corrected regex: removed comma after year
    expect(sendMessageCall.text).toMatch(/at October 27, 2023 at 6:00 AM|at October 27, 2023 at 06:00 AM/);
    expect(responseStatus).toBe(201);
    expect(responseJson).toEqual({ status: 'success' });
  });

  test('should send message with UTC timezone if project timezone is not found', async () => {
    (ProjectDetails.findById as jest.Mock).mockResolvedValue({
      _id: 'testProject',
      timezone: null, // No timezone
    });

    await handleAttendancePost(mockRequest as Request, mockResponse as Response);

    expect(serverClient.channel).toHaveBeenCalledWith("messaging", `tai_testUser`);
    const sendMessageCall = (serverClient.channel("messaging", `tai_testUser`).sendMessage as jest.Mock).mock.calls[0][0];

    // Original datetime: 2023-10-27T10:00:00.000Z
    // Expected in UTC: October 27, 2023 at 10:00 AM
    expect(sendMessageCall.text).toContain('Checkin Done for project Test Project Name at October 27, 2023');
    // Corrected regex: removed comma after year
    expect(sendMessageCall.text).toMatch(/at October 27, 2023 at 10:00 AM/);
    expect(responseStatus).toBe(201);
    expect(responseJson).toEqual({ status: 'success' });
  });

  test('should send message with UTC timezone if project is not found', async () => {
    (ProjectDetails.findById as jest.Mock).mockResolvedValue(null); // Project not found

    await handleAttendancePost(mockRequest as Request, mockResponse as Response);

    expect(serverClient.channel).toHaveBeenCalledWith("messaging", `tai_testUser`);
    const sendMessageCall = (serverClient.channel("messaging", `tai_testUser`).sendMessage as jest.Mock).mock.calls[0][0];

    // Original datetime: 2023-10-27T10:00:00.000Z
    // Expected in UTC: October 27, 2023 at 10:00 AM
    expect(sendMessageCall.text).toContain('Checkin Done for project Test Project Name at October 27, 2023');
    // Corrected regex: removed comma after year
    expect(sendMessageCall.text).toMatch(/at October 27, 2023 at 10:00 AM/);
    expect(responseStatus).toBe(201);
    expect(responseJson).toEqual({ status: 'success' });
  });

  test('should handle checkin status', async () => {
    (ProjectDetails.findById as jest.Mock).mockResolvedValue({ timezone: 'America/Los_Angeles' });
    mockRequest.body.status = 'checkin';
    await handleAttendancePost(mockRequest as Request, mockResponse as Response);
    const sendMessageCall = (serverClient.channel("messaging", `tai_testUser`).sendMessage as jest.Mock).mock.calls[0][0];
    expect(sendMessageCall.text).toContain('Checkin Done');
  });

  test('should handle checkout status', async () => {
    (ProjectDetails.findById as jest.Mock).mockResolvedValue({ timezone: 'America/Los_Angeles' });
    mockRequest.body.status = 'checkout';
    await handleAttendancePost(mockRequest as Request, mockResponse as Response);
    const sendMessageCall = (serverClient.channel("messaging", `tai_testUser`).sendMessage as jest.Mock).mock.calls[0][0];
    expect(sendMessageCall.text).toContain('Checkout Done');
  });

  // Add more tests:
  // - Error during ProjectDetails.findById
  // - Error during attendance.save()
  // - Error during attendanceLog.save()
  // - Error during serverClient.deleteMessage()
  // - Error during serverClient.sendMessage()
  // - 'cancel' status
  // - Missing required fields in request body
  // - Invalid status in request body

});
