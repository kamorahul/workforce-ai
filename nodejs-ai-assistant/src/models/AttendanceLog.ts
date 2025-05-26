import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendanceLog extends Document {
    userId: string;
    projectId: string;
    action: 'ENTER' | 'EXIT';
    timestamp: Date;
    createdAt: Date;
    updatedAt: Date;
}

const AttendanceLogSchema: Schema = new Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    projectId: {
        type: String,
        required: true,
        index: true,
    },
    action: {
        type: String,
        enum: ['ENTER', 'EXIT'],
        required: true,
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now,
    },
}, {
    timestamps: true,
});

// Compound index for querying logs per user/project efficiently
AttendanceLogSchema.index({ userId: 1, projectId: 1, timestamp: -1 });

export const AttendanceLog = mongoose.model<IAttendanceLog>('AttendanceLog', AttendanceLogSchema);
