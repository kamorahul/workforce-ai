import mongoose, { Schema, Document } from 'mongoose';

// Individual contact entry
export interface IContactEntry {
  contactUserId: string;      // GetStream user ID of the contact
  addedAt: Date;              // When this contact was added
  source: 'mobile' | 'web' | 'channel';  // How the contact was added
  nickname?: string;          // Optional custom name for the contact
  phoneNumber?: string;       // Phone number (if synced from mobile)
}

// User's contact list document
export interface IUserContacts extends Document {
  userId: string;             // Owner of this contact list (GetStream user ID)
  contacts: IContactEntry[];  // Array of contacts
  createdAt: Date;
  updatedAt: Date;
}

const ContactEntrySchema: Schema = new Schema({
  contactUserId: {
    type: String,
    required: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
  source: {
    type: String,
    enum: ['mobile', 'web', 'channel'],
    required: true,
  },
  nickname: {
    type: String,
    required: false,
  },
  phoneNumber: {
    type: String,
    required: false,
  },
}, { _id: false });

const UserContactsSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  contacts: {
    type: [ContactEntrySchema],
    default: [],
  },
}, {
  timestamps: true,
});

// Compound index for efficient contact lookup
UserContactsSchema.index({ userId: 1, 'contacts.contactUserId': 1 });

export const UserContacts = mongoose.model<IUserContacts>('UserContacts', UserContactsSchema);
