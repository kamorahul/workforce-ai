import mongoose, { Schema, Document } from 'mongoose';

export interface ISubtask {
  title: string;
  status: 'todo' | 'in progress' | 'done';
}

export interface ITask extends Document {
  name: string;
  assignee: string; // userId of the assignee
  priority: 'low' | 'medium' | 'high';
  completionDate: Date;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  completed: boolean; // Added field
  description?: string; // Optional long text description
  subtasks: ISubtask[]; // Array of subtask objects
}

const SubtaskSchema: Schema = new Schema({
  title: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['todo', 'in progress', 'done'],
    default: 'todo',
    required: true,
  },
}, { _id: false });

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
    required: true,
  },
}, {
  timestamps: true,
});

export const Task = mongoose.model<ITask>('Task', TaskSchema); 