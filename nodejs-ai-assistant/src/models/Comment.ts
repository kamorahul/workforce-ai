import mongoose, { Schema, Document } from 'mongoose';

export interface IComment extends Document {
  taskId: string;
  userId: string;
  message: string;
  getstreamCommentId?: string; // GetStream comment ID for sync
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema: Schema = new Schema({
  taskId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  getstreamCommentId: {
    type: String,
    required: false,
    index: true,
  },
}, {
  timestamps: true,
});

export const Comment = mongoose.model<IComment>('Comment', CommentSchema); 