import { getTimezoneFromCoordinates } from './index';
import geoTz from 'geo-tz'; // Import for mocking

// Mock the geo-tz module
jest.mock('geo-tz');

describe('getTimezoneFromCoordinates', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset mocks before each test
    (geoTz.find as jest.Mock).mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should return the correct timezone for valid coordinates (New York)', () => {
    (geoTz.find as jest.Mock).mockReturnValue(['America/New_York']);
    const timezone = getTimezoneFromCoordinates(40.7128, -74.0060);
    expect(timezone).toBe('America/New_York');
    expect(geoTz.find).toHaveBeenCalledWith(40.7128, -74.0060);
  });

  it('should return the correct timezone for valid coordinates (London)', () => {
    (geoTz.find as jest.Mock).mockReturnValue(['Europe/London']);
    const timezone = getTimezoneFromCoordinates(51.5074, 0.1278);
    expect(timezone).toBe('Europe/London');
    expect(geoTz.find).toHaveBeenCalledWith(51.5074, 0.1278);
  });

  it('should return "UTC" when geo-tz returns an empty array (e.g., for coordinates in the ocean)', () => {
    (geoTz.find as jest.Mock).mockReturnValue([]);
    const timezone = getTimezoneFromCoordinates(0, 0); // Coordinates don't matter as much as the mock's return
    expect(timezone).toBe('UTC');
    expect(geoTz.find).toHaveBeenCalledWith(0,0);
  });

  it('should return "UTC" and log an error if geo-tz throws an error', () => {
    (geoTz.find as jest.Mock).mockImplementation(() => {
      throw new Error('Test geo-tz error');
    });
    const timezone = getTimezoneFromCoordinates(10, 10);
    expect(timezone).toBe('UTC');
    expect(geoTz.find).toHaveBeenCalledWith(10, 10);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error finding timezone:', expect.any(Error));
  });

  // geo-tz itself handles invalid latitude/longitude by returning an empty array.
  // So, our function's behavior (returning 'UTC') for these cases is covered by
  // the 'empty array' test, assuming geo-tz behaves as expected.
  // We can add specific tests if we want to ensure geo-tz itself is robust,
  // but these primarily test our wrapper's handling of geo-tz's output.

  it('should return "UTC" when geo-tz finds no specific timezone (e.g. far out ocean point)', () => {
    // This test relies on the actual geo-tz behavior for a point likely not in any timezone.
    // We need to unmock geo-tz for this specific test case or use a spy if we want to check specific internal calls.
    // For simplicity, let's assume that for some very remote coordinates, geo-tz returns []
    (geoTz.find as jest.Mock).mockReturnValue([]);
    const timezone = getTimezoneFromCoordinates(0.00000001, 0.00000001);
    expect(timezone).toBe('UTC');
    expect(geoTz.find).toHaveBeenCalledWith(0.00000001, 0.00000001);
  });

  // Test cases for direct invalid inputs to our function, though geo-tz might catch them first.
  // The library `geo-tz` is expected to handle invalid lat/lon values and return an empty array.
  // Our function should then convert this empty array response to 'UTC'.

  it('should return "UTC" for out-of-range latitude (too high) because geo-tz should return empty', () => {
    (geoTz.find as jest.Mock).mockReturnValue([]); // Simulate geo-tz returning empty for invalid lat
    const timezone = getTimezoneFromCoordinates(100, 0);
    expect(timezone).toBe('UTC');
    // We don't check consoleErrorSpy here because the error is handled by geo-tz, not our direct try-catch
  });

  it('should return "UTC" for out-of-range latitude (too low) because geo-tz should return empty', () => {
    (geoTz.find as jest.Mock).mockReturnValue([]); // Simulate geo-tz returning empty for invalid lat
    const timezone = getTimezoneFromCoordinates(-100, 0);
    expect(timezone).toBe('UTC');
  });

  it('should return "UTC" for out-of-range longitude (too high) because geo-tz should return empty', () => {
    (geoTz.find as jest.Mock).mockReturnValue([]); // Simulate geo-tz returning empty for invalid lon
    const timezone = getTimezoneFromCoordinates(0, 200);
    expect(timezone).toBe('UTC');
  });

  it('should return "UTC" for out-of-range longitude (too low) because geo-tz should return empty', () => {
    (geoTz.find as jest.Mock).mockReturnValue([]); // Simulate geo-tz returning empty for invalid lon
    const timezone = getTimezoneFromCoordinates(0, -200);
    expect(timezone).toBe('UTC');
  });
});
