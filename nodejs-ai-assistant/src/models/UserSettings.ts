import mongoose, { Schema, Document } from 'mongoose';

export interface IUserSettings extends Document {
  userId: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSettingsSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  timezone: {
    type: String,
    required: true,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
});

export const UserSettings = mongoose.model<IUserSettings>('UserSettings', UserSettingsSchema);
