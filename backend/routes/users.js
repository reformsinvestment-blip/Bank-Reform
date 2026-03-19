const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); // Points to your smart db.js
const { sendEmail } = require('../services/emailService');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 1. Get current user profile (The fix for the refresh loop)
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db.get(
      `SELECT id, email, "firstName", "lastName", phone, address, city, state, 
              country, "postalCode", "dateOfBirth", "kycStatus", "kycVerifiedAt",
              "twoFactorEnabled", "emailVerified", "phoneVerified", 
              "createdAt", "lastLoginAt", "profileImage", status, role
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const accounts = await db.all(
      `SELECT id, "accountNumber", "accountType", balance, currency, 
              status, "createdAt"
       FROM accounts WHERE "userId" = ?`,
      [userId]
    );

    const cardData = await db.get('SELECT COUNT(*) as count FROM cards WHERE "userId" = ?', [userId]);
    const unreadData = await db.get('SELECT COUNT(*) as count FROM notifications WHERE "userId" = ? AND "isRead" = false', [userId]);

    res.json({
      success: true,
      user: {
        ...user,
        accounts: accounts || [],
        stats: {
          cardCount: parseInt(cardData?.count || 0),
          unreadNotifications: parseInt(unreadData?.count || 0)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// 2. Update user profile
router.put('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    const allowedFields = ['firstName', 'lastName', 'phone', 'address', 'city', 'state', 'country', 'postalCode'];
    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`"${field}" = ?`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) return res.status(400).json({ message: 'No valid fields' });
    values.push(userId);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

//  Get KYC status
router.post('/me/kyc', authenticate, async (req, res) => {
  try {
    const { fullName, docType, docNumber, address, idFront, idBack, selfieImage } = req.body;
    const userId = req.user.id;

    console.log("📥 [KYC] Processing for:", fullName);

    // FIX: Using "db" (not dbAsync) and correct column count
    const query = `
      INSERT INTO "kycSubmissions" 
      (id, "userId", "fullName", "documentType", "documentNumber", "idFront", "idBack", "selfieImage", status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const params = [
      uuidv4(), 
      userId, 
      fullName, 
      docType || 'passport', 
      docNumber, 
      idFront, 
      idBack, 
      selfieImage
    ];

    await db.run(query, params);

    // Update main user record
    await db.run(
      'UPDATE users SET "kycStatus" = ?, status = ?, address = ? WHERE id = ?', 
      ['pending_review', 'pending_review', address, userId]
    );

    res.json({ success: true, message: 'KYC Submitted Successfully' });

  } catch (error) {
    console.error('❌ KYC ROUTE ERROR:', error.message);
    res.status(500).json({ success: false, message: error.message });
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
    const { fullName, docType, docNumber, address, idFront, idBack, selfieImage } = req.body;
    const userId = req.user.id;

    console.log("📥 [KYC] Received data for:", fullName);

    // FIX: We use plain column names. 
    // The dbAsync.prepareSql helper in your db.js will add the quotes automatically.
    // Order: id, userId, fullName, documentType, documentNumber, idFront, idBack, selfieImage, status (9 columns)
    const query = `
      INSERT INTO "kycSubmissions" 
      (id, userId, fullName, documentType, documentNumber, idFront, idBack, selfieImage, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const params = [
      uuidv4(), 
      userId, 
      fullName, 
      docType || 'passport', 
      docNumber, 
      idFront, 
      idBack, 
      selfieImage
    ];

    // 1. Save to the KYC table
    await dbAsync.run(query, params);

    // 2. Update the main users table status
    // This is the line that stops the refresh loop
    await dbAsync.run(
      'UPDATE users SET kycStatus = ?, status = ?, address = ? WHERE id = ?', 
      ['pending_review', 'pending_review', address, userId]
    );

    console.log("✅ [KYC] Database updated successfully");

    res.json({ 
      success: true, 
      message: 'KYC documents submitted successfully' 
    });

  } catch (error) {
    console.error('❌ KYC ROUTE ERROR:', error.message);
    res.status(500).json({ 
      success: false, 
      message: "Database Error: " + error.message 
    });
  }
});
module.exports = router;