import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  userId: string;
  name?: string;
  image?: string;
  timezone?: string;
  timezoneOffset?: number;
  timezoneAbbreviation?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    image: { type: String },
    timezone: { type: String, default: 'UTC' }, // e.g., "America/New_York", "Asia/Kolkata"
    timezoneOffset: { type: Number }, // offset in minutes
    timezoneAbbreviation: { type: String }, // e.g., "EST", "IST"
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
