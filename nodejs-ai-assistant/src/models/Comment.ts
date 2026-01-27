import mongoose, { Schema, Document } from 'mongoose';

export interface ICommentReaction {
  type: string;
  userId: string;
  createdAt: Date;
}

export interface IComment extends Document {
  taskId: string;
  userId: string;
  message: string;
  getstreamCommentId?: string; // GetStream comment ID for sync
  reactions: ICommentReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentReactionSchema: Schema = new Schema({
  type: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

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
  reactions: {
    type: [CommentReactionSchema],
    default: [],
  },
}, {
  timestamps: true,
});

export const Comment = mongoose.model<IComment>('Comment', CommentSchema); 