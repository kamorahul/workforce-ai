import mongoose, { Schema, Document } from 'mongoose';

export interface ITask extends Document {
  name: string;
  assignee: string; // userId of the assignee
  priority: 'low' | 'medium' | 'high';
  completionDate: Date;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
  },
  assignee: {
    type: String,
    required: true,
    index: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true,
    default: 'medium',
  },
  completionDate: {
    type: Date,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
});

export const Task = mongoose.model<ITask>('Task', TaskSchema); 