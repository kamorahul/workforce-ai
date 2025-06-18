import { Request, Response } from 'express';
import moment from 'moment-timezone';
import sendAttendanceMessagePostController from '../../controllers/sendAttendanceMessagePostController';
import { ProjectDetails } from '../../models/Project';
import { Attendance } from '../../models/Attendance';
import { SentMessageLog } from '../../models/SentMessageLog';
import { serverClient } from '../../serverClient'; // Assuming this is the correct path

// Mock models and serverClient
jest.mock('../../models/Project');
jest.mock('../../models/Attendance');
jest.mock('../../models/SentMessageLog');
jest.mock('../../serverClient', () => ({
  serverClient: {
    queryUsers: jest.fn(),
    channel: jest.fn().mockReturnValue({
      sendMessage: jest.fn(),
    }),
  },
}));

// Mock moment-timezone
const mockMoment = {
  tz: jest.fn(),
  toDate: jest.fn(() => new Date('2024-07-27T10:00:00.000Z')), // Default mock toDate
  startOf: jest.fn().mockReturnThis(),
  endOf: jest.fn().mockReturnThis(),
};
jest.mock('moment-timezone', () => {
  const originalMoment = jest.requireActual('moment-timezone');
  const momentWrapper = (...args: any[]) => originalMoment(...args);
  Object.assign(momentWrapper, originalMoment, mockMoment, {
    // Ensure that calls to moment() without tz() still work if needed by other parts of the code
    // and allow specific tz mocking.
    tz: (...tzArgs: any[]) => {
      // If tz is called, return our mock chainable object
      if (tzArgs.length > 0) { // moment.tz(timezone) or moment.tz(date, timezone)
        // Let's refine this to better mimic moment's behavior for startOf/endOf
        const actualMomentInTz = originalMoment.tz(...tzArgs);
        return {
          startOf: (unit: string) => {
            mockMoment.startOf(unit); // track the call
            actualMomentInTz.startOf(unit); // perform actual operation
            return { // return an object that has toDate and can be further chained if needed
              toDate: () => actualMomentInTz.toDate(),
              endOf: (unit2: string) => {
                mockMoment.endOf(unit2);
                actualMomentInTz.endOf(unit2);
                return {
                  toDate: () => actualMomentInTz.toDate(),
                };
              }
            };
          },
          endOf: (unit: string) => {
            mockMoment.endOf(unit);
            actualMomentInTz.endOf(unit);
             return { // return an object that has toDate
              toDate: () => actualMomentInTz.toDate(),
            };
          },
          toDate: () => {
            mockMoment.toDate();
            return actualMomentInTz.toDate();
          }
        };
      }
      // If moment() is called without args or with a date, proxy to original moment
      return originalMoment(...(args.length > 0 ? args : []));
    }
  });
  return momentWrapper;
});


describe('sendAttendanceMessagePostController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusJsonSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    statusJsonSpy = jest.fn().mockReturnThis();
    mockRequest = {
      body: {
        userId: 'testUser',
        projectId: 'testProject',
        projectName: 'Test Project',
        action: 'checkin',
      },
    };
    mockResponse = {
      status: jest.fn().mockReturnValue({ json: statusJsonSpy }),
      json: jest.fn(),
    };

    // Default mock implementations
    (serverClient.queryUsers as jest.Mock).mockResolvedValue({ users: [{ id: 'testUser', name: 'Test User' }] });
    (ProjectDetails.findById as jest.Mock).mockResolvedValue({ _id: 'testProject', name: 'Test Project', timezone: 'UTC' });
    (Attendance.find as jest.Mock).mockResolvedValue([]);
    (SentMessageLog.findOne as jest.Mock).mockResolvedValue(null);
    (SentMessageLog.prototype.save as jest.Mock).mockResolvedValue({}); // Mock save for new SentMessageLog().save()

    // Reset moment.tz mock parts for each test if necessary, though specific tests will set this up.
    // The global mockMoment.tz is what we'll use for most direct assertions on calls.
    // This setup is complex due to the fluent API of moment.
     mockMoment.tz.mockImplementation((...tzArgs: any[]) => {
        const originalMoment = jest.requireActual('moment-timezone');
        const actualMomentInTz = originalMoment.tz(...tzArgs);
        return {
          startOf: (unit: string) => {
            mockMoment.startOf(unit); // track the call
            actualMomentInTz.startOf(unit);
            return {
              toDate: () => actualMomentInTz.toDate(),
              endOf: (unit2: string) => {
                mockMoment.endOf(unit2);
                actualMomentInTz.endOf(unit2);
                return {
                  toDate: () => actualMomentInTz.toDate(),
                };
              }
            };
          },
          endOf: (unit: string) => {
            mockMoment.endOf(unit);
            actualMomentInTz.endOf(unit);
            return {
              toDate: () => actualMomentInTz.toDate(),
            };
          },
          toDate: () => {
            mockMoment.toDate();
            return actualMomentInTz.toDate();
          }
        };
    });
  });

  describe("Check-in Scenarios", () => {
    it("should send a check-in message for 'America/New_York' at 10:00 AM if no prior check-in", async () => {
      const projectTimezone = 'America/New_York';
      // This is 2024-07-27 10:00:00 in New York
      const mockNowInNY = new Date('2024-07-27T14:00:00.000Z');
      const startOfDayInNY = new Date('2024-07-27T04:00:00.000Z'); // 2024-07-27 00:00:00 NY
      const endOfDayInNY = new Date('2024-07-27T03:59:59.999Z'); // 2024-07-27 23:59:59 NY (actually next day UTC)

      (ProjectDetails.findById as jest.Mock).mockResolvedValue({
        _id: 'testProject',
        name: 'Test Project',
        timezone: projectTimezone,
      });
      (Attendance.find as jest.Mock).mockResolvedValue([]); // No previous check-ins today
      (SentMessageLog.findOne as jest.Mock).mockResolvedValue(null); // No prompt sent today

      // Configure the moment.tz mock for this specific test
      mockMoment.tz.mockImplementation((val: any, tz?: string) => {
        const actualMoment = jest.requireActual('moment-timezone');
        let momentInstance;

        if (val && tz) { // moment.tz(val, tz)
          momentInstance = actualMoment.tz(val, tz);
        } else if (val && !tz) { // moment.tz(tz)
          momentInstance = actualMoment.tz(val);
           // THIS IS THE CRITICAL PART: If moment.tz(projectTimezone) is called,
           // its toDate() should return our mocked "now"
           return {
             startOf: (unit: string) => {
                mockMoment.startOf(unit);
                const res = actualMoment.tz(val).startOf(unit);
                return { toDate: () => res.toDate(), endOf: () => ({toDate: () => actualMoment.tz(val).endOf(unit).toDate()})};
             },
             endOf: (unit: string) => {
                mockMoment.endOf(unit);
                const res = actualMoment.tz(val).endOf(unit);
                return { toDate: () => res.toDate() };
             },
             toDate: () => {
                mockMoment.toDate();
                // If this is the call for the current time, return mockNowInNY
                if (val === projectTimezone) return mockNowInNY;
                // Otherwise, behave as normal (e.g. for startOf/endOf calls)
                return actualMoment.tz(val).toDate();
             }
           };
        } else { // moment()
            momentInstance = actualMoment();
        }

        // Default behavior for other calls, ensuring startOf/endOf return chainable toDate
        return {
          startOf: (unit: string) => ({ toDate: () => momentInstance.startOf(unit).toDate() }),
          endOf: (unit: string) => ({ toDate: () => momentInstance.endOf(unit).toDate() }),
          toDate: () => momentInstance.toDate(),
        };
      });

      // Override startOf and endOf specifically for the test timezone
      // This ensures eventDateForLog, todayStart, todayEnd are correct
       mockMoment.tz.mockImplementation((tzArg?: string | Date | moment.Moment, format?: string | moment.MomentFormatSpecification, strict?: boolean) => {
        const originalMoment = jest.requireActual('moment-timezone');
        if (typeof tzArg === 'string' && !format) { // This is typically moment.tz(timezoneName)
            if (tzArg === projectTimezone) {
                return {
                    startOf: (unit: 'day') => {
                        mockMoment.startOf(unit);
                        return { toDate: () => startOfDayInNY, endOf: () => ({ toDate: () => endOfDayInNY }) };
                    },
                    endOf: (unit: 'day') => {
                        mockMoment.endOf(unit);
                        return { toDate: () => endOfDayInNY };
                    },
                    toDate: () => { // This is for moment.tz(projectTimezone).toDate()
                        mockMoment.toDate();
                        return mockNowInNY;
                    }
                };
            }
        }
        // Fallback to original moment.tz for other usages or allow normal moment() calls
        if (arguments.length === 0) return originalMoment();
        return originalMoment.tz.apply(originalMoment, arguments as any);
      });


      mockRequest.body.action = 'checkin';
      await sendAttendanceMessagePostController(mockRequest as Request, mockResponse as Response);

      expect(ProjectDetails.findById).toHaveBeenCalledWith('testProject');
      expect(mockMoment.tz).toHaveBeenCalledWith(projectTimezone); // Check if moment.tz was called with the project's timezone

      // Check that startOf('day') and endOf('day') were called on a moment object configured with projectTimezone
      // Due to the complex mock, we check calls to our mockMoment object parts
      expect(mockMoment.startOf).toHaveBeenCalledWith('day');
      expect(mockMoment.endOf).toHaveBeenCalledWith('day');

      expect(Attendance.find).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'testUser',
        projectId: 'testProject',
        status: 'checkin',
        // Ensure datetime query uses dates reflecting New York time
        datetime: {
          $gte: startOfDayInNY, // Start of day in NY
          $lte: endOfDayInNY,   // End of day in NY
        },
      }));
      expect(SentMessageLog.findOne).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'testUser',
        projectId: 'testProject',
        messageType: 'first_enter_prompt',
        eventDate: startOfDayInNY, // Should be start of day in NY
      }));

      const sendMessageCall = (serverClient.channel('messaging', `tai_testUser`).sendMessage as jest.Mock).mock.calls[0][0];
      expect(sendMessageCall.text).toContain('Please check in to the project');
      // Important: Check that the checkInTime in the message is the mocked "current time" in NY
      expect(sendMessageCall.checkInTime).toEqual(mockNowInNY);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(statusJsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        action: 'checkin',
      }));

      // Verify AttendanceLog timestamp
      // This requires getting the instance of AttendanceLog and checking its properties before save
      // For simplicity, let's assume the mock for moment.tz().toDate() covers this.
      // If AttendanceLog model was directly using new Date(), this would be harder to test for timezone.
      // But it's using moment.tz(projectTimezone).toDate() which is mocked.
    });

    it("should send a check-in message for 'Asia/Tokyo' at 02:00 AM if no prior check-in", async () => {
      const projectTimezone = 'Asia/Tokyo';
      // Current time: 2024-07-28 02:00:00 JST = 2024-07-27 17:00:00 UTC
      const mockNowInTokyo = new Date('2024-07-27T17:00:00.000Z');
      // Start of day: 2024-07-28 00:00:00 JST = 2024-07-27 15:00:00 UTC
      const startOfDayInTokyo = new Date('2024-07-27T15:00:00.000Z');
      // End of day: 2024-07-28 23:59:59 JST = 2024-07-28 14:59:59.999 UTC
      const endOfDayInTokyo = new Date('2024-07-28T14:59:59.999Z');

      (ProjectDetails.findById as jest.Mock).mockResolvedValue({
        _id: 'testProjectTokyo',
        name: 'Test Project Tokyo',
        timezone: projectTimezone,
      });
      (Attendance.find as jest.Mock).mockResolvedValue([]);
      (SentMessageLog.findOne as jest.Mock).mockResolvedValue(null);

      mockMoment.tz.mockImplementation((tzArg?: string | Date | moment.Moment, format?: string | moment.MomentFormatSpecification, strict?: boolean) => {
        const originalMoment = jest.requireActual('moment-timezone');
        if (typeof tzArg === 'string' && !format) {
            if (tzArg === projectTimezone) {
                return {
                    startOf: (unit: 'day') => {
                        mockMoment.startOf(unit);
                        return { toDate: () => startOfDayInTokyo, endOf: () => ({ toDate: () => endOfDayInTokyo }) };
                    },
                    endOf: (unit: 'day') => {
                        mockMoment.endOf(unit);
                        return { toDate: () => endOfDayInTokyo };
                    },
                    toDate: () => {
                        mockMoment.toDate();
                        return mockNowInTokyo;
                    }
                };
            }
        }
        if (arguments.length === 0) return originalMoment();
        return originalMoment.tz.apply(originalMoment, arguments as any);
      });

      mockRequest.body.projectId = 'testProjectTokyo';
      mockRequest.body.action = 'checkin';
      await sendAttendanceMessagePostController(mockRequest as Request, mockResponse as Response);

      expect(ProjectDetails.findById).toHaveBeenCalledWith('testProjectTokyo');
      expect(mockMoment.tz).toHaveBeenCalledWith(projectTimezone);
      expect(mockMoment.startOf).toHaveBeenCalledWith('day');
      expect(mockMoment.endOf).toHaveBeenCalledWith('day');

      expect(Attendance.find).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'testUser',
        projectId: 'testProjectTokyo',
        status: 'checkin',
        datetime: {
          $gte: startOfDayInTokyo,
          $lte: endOfDayInTokyo,
        },
      }));
      expect(SentMessageLog.findOne).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'testUser',
        projectId: 'testProjectTokyo',
        messageType: 'first_enter_prompt',
        eventDate: startOfDayInTokyo,
      }));

      const sendMessageCall = (serverClient.channel('messaging', `tai_testUser`).sendMessage as jest.Mock).mock.calls[0][0];
      expect(sendMessageCall.text).toContain('Please check in to the project');
      expect(sendMessageCall.checkInTime).toEqual(mockNowInTokyo);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(statusJsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        action: 'checkin',
      }));
    });

    it("should default to UTC and send message if project has no timezone", async () => {
      const projectTimezone = 'UTC'; // Default
      // Current time: 2024-07-27 10:00:00 UTC
      const mockNowUTC = new Date('2024-07-27T10:00:00.000Z');
      // Start of day: 2024-07-27 00:00:00 UTC
      const startOfDayUTC = new Date('2024-07-27T00:00:00.000Z');
      // End of day: 2024-07-27 23:59:59.999 UTC
      const endOfDayUTC = new Date('2024-07-27T23:59:59.999Z');

      (ProjectDetails.findById as jest.Mock).mockResolvedValue({
        _id: 'testProjectUTC',
        name: 'Test Project UTC',
        timezone: null, // No timezone specified
      });
      (Attendance.find as jest.Mock).mockResolvedValue([]);
      (SentMessageLog.findOne as jest.Mock).mockResolvedValue(null);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockMoment.tz.mockImplementation((tzArg?: string | Date | moment.Moment, format?: string | moment.MomentFormatSpecification, strict?: boolean) => {
        const originalMoment = jest.requireActual('moment-timezone');
        // If tzArg is undefined or explicitly UTC (after defaulting)
        if ((typeof tzArg === 'string' && tzArg === 'UTC') || tzArg === undefined) {
            return {
                startOf: (unit: 'day') => {
                    mockMoment.startOf(unit);
                    return { toDate: () => startOfDayUTC, endOf: () => ({ toDate: () => endOfDayUTC }) };
                },
                endOf: (unit: 'day') => {
                    mockMoment.endOf(unit);
                    return { toDate: () => endOfDayUTC };
                },
                toDate: () => {
                    mockMoment.toDate();
                    return mockNowUTC;
                }
            };
        }
        // Fallback for other timezones if any are accidentally passed by a misconfigured test
        if (typeof tzArg === 'string' && !format) {
             const actualMomentInTz = originalMoment.tz(tzArg);
             return {
                startOf: (unit:string) => ({toDate: () => actualMomentInTz.clone().startOf(unit).toDate() }),
                endOf: (unit:string) => ({toDate: () => actualMomentInTz.clone().endOf(unit).toDate() }),
                toDate: () => actualMomentInTz.toDate()
             };
        }
        if (arguments.length === 0) return originalMoment();
        return originalMoment.tz.apply(originalMoment, arguments as any);
      });

      mockRequest.body.projectId = 'testProjectUTC';
      mockRequest.body.action = 'checkin';
      await sendAttendanceMessagePostController(mockRequest as Request, mockResponse as Response);

      expect(ProjectDetails.findById).toHaveBeenCalledWith('testProjectUTC');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Project timezone not found for projectId: testProjectUTC. Defaulting to UTC."));

      // It will be called with 'UTC' after the default logic
      expect(mockMoment.tz).toHaveBeenCalledWith('UTC');
      expect(mockMoment.startOf).toHaveBeenCalledWith('day');
      expect(mockMoment.endOf).toHaveBeenCalledWith('day');

      expect(Attendance.find).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'testUser',
        projectId: 'testProjectUTC',
        status: 'checkin',
        datetime: {
          $gte: startOfDayUTC,
          $lte: endOfDayUTC,
        },
      }));
      expect(SentMessageLog.findOne).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'testUser',
        projectId: 'testProjectUTC',
        messageType: 'first_enter_prompt',
        eventDate: startOfDayUTC,
      }));

      const sendMessageCall = (serverClient.channel('messaging', `tai_testUser`).sendMessage as jest.Mock).mock.calls[0][0];
      expect(sendMessageCall.text).toContain('Please check in to the project');
      expect(sendMessageCall.checkInTime).toEqual(mockNowUTC);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(statusJsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        action: 'checkin',
      }));
      consoleWarnSpy.mockRestore();
    });
  });
});

// Helper function to set the "current time" for moment.tz().toDate()
// This is a bit tricky because we are mocking parts of moment, not the whole thing.
// The most reliable way is to mock the specific Date objects returned by toDate()
// when moment.tz(projectTimezone).toDate() is called.
// However, the current mock structure for moment.tz().startOf('day').toDate()
// uses the actual moment library to calculate dates.
// We can influence this by mocking Date constructor globally for more control if needed,
// or by ensuring our assertions on sendMessage check the date components.

// For now, we rely on the fact that moment() (the main function) is not globally mocked,
// so new Date() inside the controller or moment() without .tz() would use system time.
// moment.tz(timezone).toDate() is what we're trying to control.
// The mock for moment.tz itself will be configured per test to return specific dates
// for startOf('day').toDate() and endOf('day').toDate()

const mockDateInTimezone = (dateString: string, timezone: string) => {
  const originalMoment = jest.requireActual('moment-timezone');
  return originalMoment.tz(dateString, timezone).toDate();
};
