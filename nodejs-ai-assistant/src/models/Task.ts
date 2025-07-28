import mongoose, { Schema, Document } from 'mongoose';

export interface ISubtask {
  name: string;
  completed: boolean;
}

export interface ITask extends Document {
  name: string;
  assignee: string[]; // Array of userIds of the assignees
  priority: 'low' | 'medium' | 'high';
  completionDate: Date;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  completed: boolean; // Added field
  description?: string; // Optional long text description
  subtasks: ISubtask[]; // Array of subtask objects
  createdBy: string; // userId of the task creator
}

const SubtaskSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
  },
  completed: {
    type: Boolean,
    required: true,
    default: false,
  },
}, { _id: false });

const TaskSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
  },
  assignee: {
    type: [String],
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
  completed: {
    type: Boolean,
    default: false,
    required: true,
  },
  description: {
    type: String,
    required: false,
  },
  subtasks: {
    type: [SubtaskSchema],
    default: [],
  },
  createdBy: {
    type: String,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
});

export const Task = mongoose.model<ITask>('Task', TaskSchema); 