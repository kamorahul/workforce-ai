import mongoose, { Schema, Document } from 'mongoose';

export interface ISentMessageLog extends Document {
  userId: string;
  projectId: string;
  messageType: 'first_enter_prompt' | 'last_exit_prompt';
  eventDate: Date; // Should store YYYY-MM-DD as a Date object (time part set to 00:00:00)
  createdAt: Date; // Automatically handled by timestamps: true
  updatedAt: Date; // Automatically handled by timestamps: true
}

const SentMessageLogSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  projectId: {
    type: String,
    required: true,
    index: true,
  },
  messageType: {
    type: String,
    enum: ['first_enter_prompt', 'last_exit_prompt'],
    required: true,
  },
  eventDate: { // Store as Date, but represent YYYY-MM-DD for querying uniqueness per day
    type: Date,
    required: true,
    index: true,
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Compound index for ensuring message uniqueness per day for a user/project/type
SentMessageLogSchema.index({ userId: 1, projectId: 1, eventDate: 1, messageType: 1 }, { unique: true });

export const SentMessageLog = mongoose.model<ISentMessageLog>('SentMessageLog', SentMessageLogSchema);
