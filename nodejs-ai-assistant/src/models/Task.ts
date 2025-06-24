import mongoose, { Document, Schema } from 'mongoose';

export interface ITask extends Document {
  userId: string;
  channelId: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
  deadline?: string;
  dependencies?: string[];
  context: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'pending' | 'completed' | 'cancelled';
  completedAt?: Date;
}

const TaskSchema = new Schema<ITask>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
    required: true
  },
  deadline: {
    type: String,
    required: false
  },
  dependencies: [{
    type: String
  }],
  context: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending',
    required: true
  },
  completedAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
TaskSchema.index({ userId: 1, channelId: 1, createdAt: -1 });
TaskSchema.index({ status: 1, priority: 1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema); 