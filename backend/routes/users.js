const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); // Points to your smart db.js
const { sendEmail } = require('../services/emailService');
const router = express.Router();

// 1. Get current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // FIX: Wrapped CamelCase columns in quotes and used $1
    const user = await db.get(
      `SELECT id, email, "firstName", "lastName", phone, address, city, state, 
              country, "postalCode", "dateOfBirth", "kycStatus", "kycVerifiedAt",
              "twoFactorEnabled", "emailVerified", "phoneVerified", 
              "createdAt", "lastLoginAt", "profileImage"
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get user's accounts - FIX: Quoted columns
    const accounts = await db.all(
      `SELECT id, "accountNumber", "accountType", balance, currency, 
              status, "isDefault", "createdAt"
       FROM accounts WHERE "userId" = $1 AND status = 'active'`,
      [userId]
    );

    // Get user's cards count
    const cardData = await db.get(
      'SELECT COUNT(*) as "cardCount" FROM cards WHERE "userId" = $1 AND status = $2',
      [userId, 'active']
    );

    // Get unread notifications count - FIX: Boolean check
    const unreadData = await db.get(
      'SELECT COUNT(*) as "unreadCount" FROM notifications WHERE "userId" = $1 AND "isRead" = false',
      [userId]
    );

    res.json({
      success: true,
      user: {
        ...user,
        accounts,
        stats: {
          cardCount: parseInt(cardData.cardCount || 0),
          unreadNotifications: parseInt(unreadData.unreadCount || 0)
        }
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve profile' });
  }
});

// 2. Update user profile
router.put('/me', authenticate, [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user.id;
    const updates = req.body;
    const allowedFields = ['firstName', 'lastName', 'phone', 'address', 'city', 'state', 'country', 'postalCode', 'dateOfBirth'];

    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`"${field}" = $${values.length + 1}`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) return res.status(400).json({ message: 'No valid fields to update' });

    values.push(userId);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

    const user = await db.get(`SELECT * FROM users WHERE id = $1`, [userId]);
    res.json({ success: true, message: 'Profile updated successfully', user });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// 3. Upload profile image
router.post('/me/avatar', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: 'Image is required' });

    const imageUrl = `/uploads/avatars/${userId}_${Date.now()}.jpg`;

    // FIX: Quoted "profileImage"
    await db.run('UPDATE users SET "profileImage" = $1 WHERE id = $2', [imageUrl, userId]);

    res.json({ success: true, message: 'Profile image updated', imageUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to upload profile image' });
  }
});

// 4. Get user settings
router.get('/me/settings', authenticate, async (req, res) => {
  try {
    // FIX: Quoted columns
    const settings = await db.get(
      `SELECT "twoFactorEnabled", "loginNotifications", "transactionNotifications",
              "marketingEmails", language, timezone, currency
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve settings' });
  }
});

// 5. Update user settings
router.put('/me/settings', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    const allowedFields = ['twoFactorEnabled', 'loginNotifications', 'transactionNotifications', 'marketingEmails', 'language', 'timezone', 'currency'];

    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`"${field}" = $${values.length + 1}`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) return res.status(400).json({ message: 'No valid fields' });

    values.push(userId);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

// 6. Get user activity log
router.get('/me/activity', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    // FIX: Quoted table name "userActivity" and "createdAt"
    const activities = await db.all(
      `SELECT * FROM "userActivity" 
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const countData = await db.get('SELECT COUNT(*) as total FROM "userActivity" WHERE "userId" = $1', [userId]);

    res.json({
      success: true,
      activities,
      pagination: {
        total: parseInt(countData.total || 0),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve activity log' });
  }
});
// --- CONTINUATION OF backend/routes/users.js ---

// 7. Change password
router.put('/me/password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await db.get('SELECT password FROM users WHERE id = $1', [userId]);

    const bcrypt = require('bcryptjs');
    const isValid = await bcrypt.compare(currentPassword, user.password);

    if (!isValid) return res.status(400).json({ success: false, message: 'Current password incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    await sendEmail({
      to: req.user.email,
      subject: 'Password Changed',
      template: 'passwordChanged',
      data: { name: req.user.firstName, changedAt: new Date().toISOString() }
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// 8. Enable/Disable 2FA
router.put('/me/2fa', authenticate, [
  body('enabled').isBoolean()
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled, method = 'email' } = req.body;

    // FIX: Quoted columns and boolean value
    await db.run(
      'UPDATE users SET "twoFactorEnabled" = $1, "twoFactorMethod" = $2 WHERE id = $3',
      [enabled, method, userId]
    );

    res.json({ success: true, message: `2FA ${enabled ? 'enabled' : 'disabled'}`, twoFactorEnabled: enabled });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update 2FA' });
  }
});

// 9. Submit KYC documents
router.post('/me/kyc', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { documentType, documentNumber, documentImage, selfieImage } = req.body;

    // FIX: Quoted table name and columns
    await db.run(
      `INSERT INTO "kycSubmissions" 
       (id, "userId", "documentType", "documentNumber", "documentImage", "selfieImage", status, "submittedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)`,
      [uuidv4(), userId, documentType, documentNumber, documentImage, selfieImage]
    );

    await db.run('UPDATE users SET "kycStatus" = $1 WHERE id = $2', ['pending', userId]);

    res.json({ success: true, message: 'KYC submitted successfully', status: 'pending' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to submit KYC' });
  }
});

// 10. Get KYC status
router.get('/me/kyc', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    // FIX: Quoted columns
    const kyc = await db.get(
      'SELECT "kycStatus", "kycVerifiedAt", "kycRejectedReason" FROM users WHERE id = $1',
      [userId]
    );

    const submissions = await db.all(
      'SELECT "documentType", status, "submittedAt", "reviewedAt", "rejectionReason" FROM "kycSubmissions" WHERE "userId" = $1 ORDER BY "submittedAt" DESC',
      [userId]
    );

    res.json({ success: true, kycStatus: kyc.kycStatus, verifiedAt: kyc.kycVerifiedAt, submissions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve KYC status' });
  }
});

// 11. Admin: Get all users
router.get('/', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { search, kycStatus, role, limit = 20, offset = 0 } = req.query;

    let sql = `SELECT id, email, "firstName", "lastName", phone, "kycStatus", role, status, "createdAt", "lastLoginAt" FROM users WHERE 1=1`;
    let params = [];

    if (search) {
      sql += ` AND (email ILIKE $${params.length + 1} OR "firstName" ILIKE $${params.length + 2} OR "lastName" ILIKE $${params.length + 3})`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (kycStatus) {
      sql += ` AND "kycStatus" = $${params.length + 1}`;
      params.push(kycStatus);
    }

    sql += ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const users = await db.all(sql, params);
    const countData = await db.get('SELECT COUNT(*) as total FROM users');

    res.json({ success: true, users, pagination: { total: parseInt(countData.total), limit, offset } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve users' });
  }
});

// 12. Admin: Get single user
router.get('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db.get(`SELECT * FROM users WHERE id = $1`, [id]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const accounts = await db.all('SELECT * FROM accounts WHERE "userId" = $1', [id]);
    const transactions = await db.all(`
      SELECT t.*, a."accountNumber" 
      FROM transactions t
      JOIN accounts a ON t."accountId" = a.id
      WHERE a."userId" = $1
      ORDER BY t.date DESC LIMIT 10`, [id]);

    res.json({ success: true, user, accounts, recentTransactions: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve user' });
  }
});

// 13. Admin: Update user
router.put('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const allowedFields = ['firstName', 'lastName', 'phone', 'kycStatus', 'role', 'status'];

    const fields = [];
    const values = [];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`"${field}" = $${values.length + 1}`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) return res.status(400).json({ message: 'No valid fields' });

    values.push(id);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});
// kyc verification for user
router.post('/me/kyc', authenticate, async (req, res) => {
  try {
    const { fullName, docNumber, address, idFront, idBack, selfieImage } = req.body;
    const userId = req.user.id;

    // 1. Store everything in the table (Update to match new columns)
    await dbAsync.run(`
      INSERT INTO "kycSubmissions" 
      (id, "userId", "fullName", "documentNumber", "idFront", "idBack", "selfieImage", status, "submittedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', CURRENT_TIMESTAMP)
    `, [uuidv4(), userId, fullName, docNumber, idFront, idBack, selfieImage]);

    // 2. Update the user status so they are "Pending Review"
    await dbAsync.run(`
      UPDATE users 
      SET "kycStatus" = 'pending_review',
          address = $1
      WHERE id = $2
    `, [address, userId]);

    res.json({
      success: true,
      message: 'KYC submitted successfully. Admin review pending.'
    });

  } catch (error) {
    console.error('KYC Submission Crash:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;