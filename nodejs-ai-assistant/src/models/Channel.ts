import mongoose, { Schema, Document } from 'mongoose';

export interface IChannel extends Document {
  channelId: string;
  type: string;
  name: string;
  createdBy: string;
  members: string[];
  image?: string;
  createdAt: Date;
  updatedAt: Date;
  // Add more fields as needed (e.g., custom, extraData)
}

const ChannelSchema: Schema = new Schema({
  channelId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  createdBy: {
    type: String,
    required: true,
  },
  members: {
    type: [String],
    required: true,
    default: [],
  },
  image: {
    type: String,
    required: false,
  },
}, {
  timestamps: true,
});

export const Channel = mongoose.model<IChannel>('Channel', ChannelSchema); 