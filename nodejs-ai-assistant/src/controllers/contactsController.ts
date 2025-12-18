import express, { Request, Response, Router } from 'express';
import { UserContacts, IContactEntry } from '../models/Contact';
import { serverClient } from '../serverClient';

const router: Router = express.Router();

// Helper to get userId from Auth0 JWT
const getUserId = (req: Request): string | null => {
  // Auth0 JWT payload is available via express-oauth2-jwt-bearer middleware
  const auth = (req as any).auth;
  if (auth?.payload?.sub) {
    return auth.payload.sub;
  }
  // Fallback: check for userId in body or query (for flexibility)
  return req.body?.userId || req.query?.userId || null;
};

// ============================================================
// GET / - Get current user's contacts
// ============================================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Find user's contact list
    const userContacts = await UserContacts.findOne({ userId });

    if (!userContacts || userContacts.contacts.length === 0) {
      res.json({ contacts: [], total: 0 });
      return;
    }

    // Get GetStream user details for all contacts
    const contactUserIds = userContacts.contacts.map(c => c.contactUserId);

    let users: any[] = [];
    try {
      const result = await serverClient.queryUsers({
        id: { $in: contactUserIds }
      });
      users = result.users;
    } catch (streamError) {
      console.error('Error fetching users from GetStream:', streamError);
    }

    // Merge contact data with user details
    const enrichedContacts = userContacts.contacts.map(contact => {
      const user = users.find(u => u.id === contact.contactUserId);
      return {
        contactUserId: contact.contactUserId,
        addedAt: contact.addedAt,
        source: contact.source,
        nickname: contact.nickname,
        phoneNumber: contact.phoneNumber,
        user: user || null,
      };
    });

    res.json({
      contacts: enrichedContacts,
      total: enrichedContacts.length,
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// ============================================================
// POST / - Add a new contact
// ============================================================
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { contactUserId, source = 'web', nickname, phoneNumber } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!contactUserId) {
      res.status(400).json({ error: 'contactUserId is required' });
      return;
    }

    // Prevent adding self as contact
    if (contactUserId === userId) {
      res.status(400).json({ error: 'Cannot add yourself as a contact' });
      return;
    }

    // Verify the contact user exists in GetStream
    try {
      const { users } = await serverClient.queryUsers({ id: contactUserId });
      if (users.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    } catch (err) {
      console.error('Error verifying user in GetStream:', err);
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Find or create user's contact list
    let userContacts = await UserContacts.findOne({ userId });

    if (!userContacts) {
      userContacts = new UserContacts({ userId, contacts: [] });
    }

    // Check if contact already exists
    const existingContact = userContacts.contacts.find(
      c => c.contactUserId === contactUserId
    );

    if (existingContact) {
      res.status(409).json({ error: 'Contact already exists' });
      return;
    }

    // Add the new contact
    const newContact: IContactEntry = {
      contactUserId,
      addedAt: new Date(),
      source: source as 'mobile' | 'web' | 'channel',
      nickname,
      phoneNumber,
    };

    userContacts.contacts.push(newContact);
    await userContacts.save();

    // Get full user details for response
    let contactUser = null;
    try {
      const { users } = await serverClient.queryUsers({ id: contactUserId });
      contactUser = users[0] || null;
    } catch (err) {
      console.error('Error fetching contact user details:', err);
    }

    res.status(201).json({
      success: true,
      contact: {
        ...newContact,
        user: contactUser,
      },
    });
  } catch (error) {
    console.error('Error adding contact:', error);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// ============================================================
// DELETE /:contactUserId - Remove a contact
// ============================================================
router.delete('/:contactUserId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { contactUserId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const userContacts = await UserContacts.findOne({ userId });

    if (!userContacts) {
      res.status(404).json({ error: 'Contact list not found' });
      return;
    }

    const initialLength = userContacts.contacts.length;
    userContacts.contacts = userContacts.contacts.filter(
      c => c.contactUserId !== contactUserId
    ) as any;

    if (userContacts.contacts.length === initialLength) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    await userContacts.save();

    res.json({ success: true, message: 'Contact removed' });
  } catch (error) {
    console.error('Error removing contact:', error);
    res.status(500).json({ error: 'Failed to remove contact' });
  }
});

// ============================================================
// POST /sync - Sync contacts from mobile device
// Used by mobile app to bulk sync device contacts
// ============================================================
router.post('/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { contacts: mobileContacts } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!Array.isArray(mobileContacts)) {
      res.status(400).json({ error: 'contacts must be an array' });
      return;
    }

    // Find or create user's contact list
    let userContacts = await UserContacts.findOne({ userId });

    if (!userContacts) {
      userContacts = new UserContacts({ userId, contacts: [] });
    }

    // Get existing contact IDs
    const existingContactIds = new Set(
      userContacts.contacts.map(c => c.contactUserId)
    );

    // Filter and add new contacts (skip duplicates and self)
    const newContacts: IContactEntry[] = [];

    for (const mc of mobileContacts) {
      if (
        mc.contactUserId &&
        mc.contactUserId !== userId &&
        !existingContactIds.has(mc.contactUserId)
      ) {
        newContacts.push({
          contactUserId: mc.contactUserId,
          addedAt: new Date(),
          source: 'mobile',
          phoneNumber: mc.phoneNumber,
        });
        existingContactIds.add(mc.contactUserId);
      }
    }

    if (newContacts.length > 0) {
      userContacts.contacts.push(...newContacts);
      await userContacts.save();
    }

    res.json({
      success: true,
      added: newContacts.length,
      total: userContacts.contacts.length,
    });
  } catch (error) {
    console.error('Error syncing contacts:', error);
    res.status(500).json({ error: 'Failed to sync contacts' });
  }
});

// ============================================================
// GET /search - Search within user's contacts
// ============================================================
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { query } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const userContacts = await UserContacts.findOne({ userId });

    if (!userContacts || userContacts.contacts.length === 0) {
      res.json({ contacts: [], total: 0 });
      return;
    }

    const contactUserIds = userContacts.contacts.map(c => c.contactUserId);

    // Search GetStream users that are in user's contacts
    const filter: any = { id: { $in: contactUserIds } };

    if (query && typeof query === 'string' && query.trim()) {
      filter.name = { $autocomplete: query };
    }

    let users: any[] = [];
    try {
      const result = await serverClient.queryUsers(filter, { name: 1 }, { limit: 50 });
      users = result.users;
    } catch (streamError) {
      console.error('Error searching users in GetStream:', streamError);
    }

    // Merge with contact data
    const enrichedContacts = users.map(user => {
      const contact = userContacts.contacts.find(c => c.contactUserId === user.id);
      return {
        contactUserId: contact?.contactUserId || user.id,
        addedAt: contact?.addedAt,
        source: contact?.source,
        nickname: contact?.nickname,
        phoneNumber: contact?.phoneNumber,
        user,
      };
    });

    res.json({
      contacts: enrichedContacts,
      total: enrichedContacts.length,
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    res.status(500).json({ error: 'Failed to search contacts' });
  }
});

// ============================================================
// PATCH /:contactUserId - Update contact (nickname)
// ============================================================
router.patch('/:contactUserId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { contactUserId } = req.params;
    const { nickname } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const userContacts = await UserContacts.findOne({ userId });

    if (!userContacts) {
      res.status(404).json({ error: 'Contact list not found' });
      return;
    }

    const contact = userContacts.contacts.find(
      c => c.contactUserId === contactUserId
    );

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    if (nickname !== undefined) {
      contact.nickname = nickname;
    }

    await userContacts.save();

    res.json({ success: true, contact });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

export default router;
