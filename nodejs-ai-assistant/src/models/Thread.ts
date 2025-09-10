import mongoose, { Schema, Document } from 'mongoose';

export interface IThread extends Document {
  channelId: string;
  openAiThreadId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
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
  }
}, {
  timestamps: true,
});

// Compound index for efficient lookups by channel and user
ThreadSchema.index({ channelId: 1, userId: 1 }, { unique: true });

export const Thread = mongoose.model<IThread>('Thread', ThreadSchema);
