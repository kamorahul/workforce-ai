// Function to convert email to stream format
export function convertEmailToStreamFormat(email: string) {
    // Replace dots with underscores
    let converted = email.replace(/\./g, '_');
    // Replace @ with underscore
    converted = converted.replace(/@/g, '_');
    return converted;
  }

  // Function to convert stream format back to email
export function convertStreamToEmail(streamFormat: string) {
    // Split the string by underscores
    const parts = streamFormat.split('_');
    
    // The last part will be 'com'
    const domain = parts.pop();
    // The second last part will be 'gmail'
    const emailProvider = parts.pop();
    
    // Join the remaining parts with dots
    const username = parts.join('.');
    
    // Combine all parts to form the email
    return `${username}@${emailProvider}.${domain}`;
  }

import geoTz from 'geo-tz';

/**
 * Finds the timezone for the given coordinates.
 * @param latitude The latitude.
 * @param longitude The longitude.
 * @returns The timezone string (e.g., "America/New_York") or "UTC" if not found.
 */
export const getTimezoneFromCoordinates = (latitude: number, longitude: number): string => {
  try {
    const timezones = geoTz.find(latitude, longitude);
    if (timezones && timezones.length > 0) {
      return timezones[0];
    }
    return 'UTC'; // Default to UTC if no timezone is found
  } catch (error) {
    console.error('Error finding timezone:', error);
    return 'UTC'; // Default to UTC in case of an error
  }
};