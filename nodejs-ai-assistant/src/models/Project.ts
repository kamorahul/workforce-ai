import mongoose, { Schema, Document } from 'mongoose';

// Interface for GeoJSON Point
interface IPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

// Interface for ProjectDetails document
export interface IProjectDetails extends Document {
  projectId: string;
  projectName: string;
  email: string;
  location?: IPoint;
  description?: string;
  startTime?: Date;
  endTime?: Date;
  timeSheetRequirement?: boolean;
  swms?: string;
  qrCode?: string;
  timezone?: string;
  channelId: string;
}

// GeoJSON Point Schema
const pointSchema = new Schema<IPoint>({
  type: {
    type: String,
    enum: ['Point'],
    required: true,
  },
  coordinates: {
    type: [Number],
    required: true,
  },
});

// ProjectDetails Schema
const projectDetailsSchema = new Schema<IProjectDetails>({
  projectId: {
    type: String,
    unique: true,
    required: true,
  },
  projectName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  location: {
    type: pointSchema,
    required: false,
  },
  description: {
    type: String,
    required: false,
  },
  startTime: {
    type: Date,
    required: false,
  },
  endTime: {
    type: Date,
    required: false,
  },
  timeSheetRequirement: {
    type: Boolean,
    required: false,
  },
  swms: {
    type: String,
    required: false,
  },
  qrCode: {
    type: String,
    required: false,
  },
  timezone: {
    type: String,
    required: false,
  },
  channelId: {
    type: String,
    required: true,
  },
}, { timestamps: true }); // Adds createdAt and updatedAt timestamps

// Create and export the ProjectDetails model
export const ProjectDetails = mongoose.model<IProjectDetails>('ProjectDetails', projectDetailsSchema);

