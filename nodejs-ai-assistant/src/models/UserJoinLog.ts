import mongoose, { Schema, Document } from 'mongoose';

export interface IUserJoinLog extends Document {
  userId: string;
  joinedAt: Date;
}

const UserJoinLogSchema = new Schema<IUserJoinLog>({
  userId: { type: String, required: true, unique: true },
  joinedAt: { type: Date, required: true, default: Date.now },
});

export const UserJoinLog = mongoose.models.UserJoinLog || mongoose.model<IUserJoinLog>('UserJoinLog', UserJoinLogSchema); 