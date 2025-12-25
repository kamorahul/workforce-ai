import mongoose, { Schema, Document } from 'mongoose';

export interface IThread extends Document {
  channelId: string;
  openAiThreadId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const ThreadSchema: Schema = new Schema({
  channelId: {
    type: String,
    required: true,
    index: true,
  },
  openAiThreadId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from creation
    index: { expireAfterSeconds: 0 } // MongoDB TTL index - auto-deletes when expiresAt is reached
  }
}, {
  timestamps: true,
});

// Compound index for efficient lookups by channel and user
ThreadSchema.index({ channelId: 1, userId: 1 }, { unique: true });

export const Thread = mongoose.model<IThread>('Thread', ThreadSchema);
