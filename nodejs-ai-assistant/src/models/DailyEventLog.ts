// This file was previously DummyDailyEventLog.ts, now renamed to DailyEventLog.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IDailyEventLog extends Document {
  userId: string;
  eventDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DailyEventLogSchema = new Schema<IDailyEventLog>({
  userId: { type: String, required: true, index: true },
  eventDate: { type: Date, required: true, index: true },
}, { timestamps: true });

DailyEventLogSchema.index({ userId: 1, eventDate: 1 }, { unique: true });

export const DailyEventLog = mongoose.models.DailyEventLog || mongoose.model<IDailyEventLog>('DailyEventLog', DailyEventLogSchema); 