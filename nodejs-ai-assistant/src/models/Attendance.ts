import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendance extends Document {
  userId: string;
  projectId: string;
  datetime: Date;
  status: 'checkin' | 'checkout';
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  projectId: {
    type: String,
    required: true,
    index: true
  },
  datetime: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['checkin', 'checkout'],
    required: true
  }
}, {
  timestamps: true
});

// Compound index for efficient querying
AttendanceSchema.index({ userId: 1, datetime: 1, status: 1 });

export const Attendance = mongoose.model<IAttendance>('Attendance', AttendanceSchema); 