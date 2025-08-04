import mongoose, { Schema, Document } from 'mongoose';

export interface ITask extends Document {
  name: string;
  assignee: string[]; // Array of userIds of the assignees
  priority: 'low' | 'medium' | 'high';
  completionDate: Date;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  completed: boolean;
  description?: string; // Optional long text description
  createdBy: string; // userId of the task creator
  parentTaskId?: string; // Reference to parent task if this is a subtask
}

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
    required: false,
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
  createdBy: {
    type: String,
    required: true,
    index: true,
  },
  parentTaskId: {
    type: Schema.Types.ObjectId,
    ref: 'Task',
    required: false,
    index: true,
  }
}, {
  timestamps: true,
});

export const Task = mongoose.model<ITask>('Task', TaskSchema);