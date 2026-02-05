import mongoose, { Schema, Document } from 'mongoose';

export interface ITask extends Document {
  name: string;
  assignee: string[]; // Array of userIds of the assignees
  priority: 'low' | 'medium' | 'high';
  completionDate?: Date;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  completed: boolean;
  status: 'todo' | 'in_progress' | 'completed'; // Task status for workflow
  description?: string; // Optional long text description
  createdBy: string; // userId of the task creator
  parentTaskId?: string; // Reference to parent task if this is a subtask
  /**
   * Timezone where the task was created (IANA timezone identifier)
   * e.g., "Asia/Kolkata", "America/New_York", "Europe/London"
   * Used for displaying the original due date context to users in different timezones
   */
  timezone?: string;
  attachments?: Array<{
    uri: string;
    name: string;
    type: string;
    size?: number;
    commentId?: string;
  }>;
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
    required: false,
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
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'completed'],
    default: 'todo',
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
  },
  timezone: {
    type: String,
    required: false,
    // IANA timezone identifier (e.g., "Asia/Kolkata", "America/New_York")
    // Defaults to UTC if not provided
    default: 'UTC',
  },
  attachments: {
    type: [{
      uri: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      type: {
        type: String,
        required: true,
      },
      size: {
        type: Number,
        required: false,
      },
      commentId: { type: String, required: false, default: null },
    }],
    required: false,
    default: [],
  }
}, {
  timestamps: true,
});

export const Task = mongoose.model<ITask>('Task', TaskSchema);