const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const db = require('../database/db');
const { sendEmail } = require('../services/emailService');
const router = express.Router();

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db.get(
      `SELECT id, email, firstName, lastName, phone, address, city, state, 
              country, postalCode, dateOfBirth, kycStatus, kycVerifiedAt,
              twoFactorEnabled, emailVerified, phoneVerified, 
              createdAt, lastLoginAt, profileImage
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's accounts
    const accounts = await db.all(
      `SELECT id, accountNumber, accountType, balance, currency, 
              status, isDefault, createdAt
       FROM accounts WHERE userId = ? AND status = 'active'`,
      [userId]
    );

    // Get user's cards count
    const { cardCount } = await db.get(
      'SELECT COUNT(*) as cardCount FROM cards WHERE userId = ? AND status = ?',
      [userId, 'active']
    );

    // Get unread notifications count
    const { unreadCount } = await db.get(
      'SELECT COUNT(*) as unreadCount FROM notifications WHERE userId = ? AND isRead = 0',
      [userId]
    );

    res.json({
      user: {
        ...user,
        accounts,
        stats: {
          cardCount,
          unreadNotifications: unreadCount
        }
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to retrieve profile' });
  }
});

// Update user profile
router.put('/me', authenticate, [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('postalCode').optional().trim(),
  body('dateOfBirth').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const updates = req.body;

    const allowedFields = [
      'firstName', 'lastName', 'phone', 'address', 
      'city', 'state', 'country', 'postalCode', 'dateOfBirth'
    ];

    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    await db.run(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      [...values, userId]
    );

    // Get updated user
    const user = await db.get(
      `SELECT id, email, firstName, lastName, phone, address, city, state, 
              country, postalCode, dateOfBirth, updatedAt
       FROM users WHERE id = ?`,
      [userId]
    );

    res.json({
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Upload profile image
router.post('/me/avatar', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ message: 'Image is required' });
    }

    // In production, you would upload to cloud storage
    // For now, we'll store a reference
    const imageUrl = `/uploads/avatars/${userId}_${Date.now()}.jpg`;

    await db.run(
      'UPDATE users SET profileImage = ? WHERE id = ?',
      [imageUrl, userId]
    );

    res.json({
      message: 'Profile image updated',
      imageUrl
    });

  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: 'Failed to upload profile image' });
  }
});

// Get user settings
router.get('/me/settings', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await db.get(
      `SELECT twoFactorEnabled, loginNotifications, transactionNotifications,
              marketingEmails, language, timezone, currency
       FROM users WHERE id = ?`,
      [userId]
    );

    res.json({ settings });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Failed to retrieve settings' });
  }
});

// Update user settings
router.put('/me/settings', authenticate, [
  body('twoFactorEnabled').optional().isBoolean(),
  body('loginNotifications').optional().isBoolean(),
  body('transactionNotifications').optional().isBoolean(),
  body('marketingEmails').optional().isBoolean(),
  body('language').optional().isIn(['en', 'es', 'fr', 'de', 'zh']),
  body('timezone').optional(),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const updates = req.body;

    const allowedFields = [
      'twoFactorEnabled', 'loginNotifications', 'transactionNotifications',
      'marketingEmails', 'language', 'timezone', 'currency'
    ];

    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    await db.run(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      [...values, userId]
    );

    res.json({ message: 'Settings updated successfully' });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

// Get user activity log
router.get('/me/activity', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const activities = await db.all(
      `SELECT * FROM userActivity 
       WHERE userId = ?
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const { total } = await db.get(
      'SELECT COUNT(*) as total FROM userActivity WHERE userId = ?',
      [userId]
    );

    res.json({
      activities,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ message: 'Failed to retrieve activity log' });
  }
});

// Change password
router.put('/me/password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await db.get('SELECT password FROM users WHERE id = ?', [userId]);

    // Verify current password
    const bcrypt = require('bcryptjs');
    const isValid = await bcrypt.compare(currentPassword, user.password);

    if (!isValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.run(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );

    // Send email notification
    await sendEmail({
      to: req.user.email,
      subject: 'Password Changed',
      template: 'passwordChanged',
      data: {
        name: req.user.firstName,
        changedAt: new Date().toISOString()
      }
    });

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Enable/Disable 2FA
router.put('/me/2fa', authenticate, [
  body('enabled').isBoolean(),
  body('method').optional().isIn(['email', 'sms', 'authenticator'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { enabled, method = 'email' } = req.body;

    await db.run(
      'UPDATE users SET twoFactorEnabled = ?, twoFactorMethod = ? WHERE id = ?',
      [enabled ? 1 : 0, method, userId]
    );

    // Send notification
    await sendEmail({
      to: req.user.email,
      subject: `Two-Factor Authentication ${enabled ? 'Enabled' : 'Disabled'}`,
      template: 'twoFactorChanged',
      data: {
        name: req.user.firstName,
        enabled,
        method
      }
    });

    res.json({ 
      message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`,
      twoFactorEnabled: enabled
    });

  } catch (error) {
    console.error('2FA update error:', error);
    res.status(500).json({ message: 'Failed to update 2FA settings' });
  }
});

// Submit KYC documents
router.post('/me/kyc', authenticate, [
  body('documentType').isIn(['passport', 'drivers_license', 'national_id']),
  body('documentNumber').notEmpty(),
  body('documentImage').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { documentType, documentNumber, documentImage, selfieImage } = req.body;

    // Store KYC submission
    await db.run(
      `INSERT INTO kycSubmissions 
       (userId, documentType, documentNumber, documentImage, selfieImage, status, submittedAt)
       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`,
      [userId, documentType, documentNumber, documentImage, selfieImage]
    );

    // Update user KYC status
    await db.run(
      'UPDATE users SET kycStatus = ? WHERE id = ?',
      ['pending', userId]
    );

    // Notify admins
    const admins = await db.all('SELECT email, firstName FROM users WHERE role = ?', ['admin']);
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: 'New KYC Submission',
        template: 'adminNewKYC',
        data: {
          name: admin.firstName,
          userEmail: req.user.email,
          documentType
        }
      });
    }

    res.json({ 
      message: 'KYC documents submitted successfully',
      status: 'pending'
    });

  } catch (error) {
    console.error('KYC submission error:', error);
    res.status(500).json({ message: 'Failed to submit KYC documents' });
  }
});

// Get KYC status
router.get('/me/kyc', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const kyc = await db.get(
      `SELECT kycStatus, kycVerifiedAt, kycRejectedReason
       FROM users WHERE id = ?`,
      [userId]
    );

    const submissions = await db.all(
      `SELECT documentType, status, submittedAt, reviewedAt, rejectionReason
       FROM kycSubmissions WHERE userId = ? ORDER BY submittedAt DESC`,
      [userId]
    );

    res.json({
      kycStatus: kyc.kycStatus,
      verifiedAt: kyc.kycVerifiedAt,
      submissions
    });

  } catch (error) {
    console.error('Get KYC status error:', error);
    res.status(500).json({ message: 'Failed to retrieve KYC status' });
  }
});

// Admin: Get all users
router.get('/', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { 
      search, 
      kycStatus, 
      role,
      limit = 20, 
      offset = 0 
    } = req.query;

    let query = `SELECT id, email, firstName, lastName, phone, kycStatus, 
                        role, status, createdAt, lastLoginAt
                 FROM users WHERE 1=1`;
    let params = [];

    if (search) {
      query += ` AND (email LIKE ? OR firstName LIKE ? OR lastName LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (kycStatus) {
      query += ' AND kycStatus = ?';
      params.push(kycStatus);
    }

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const users = await db.all(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    let countParams = [];

    if (search) {
      countQuery += ` AND (email LIKE ? OR firstName LIKE ? OR lastName LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (kycStatus) {
      countQuery += ' AND kycStatus = ?';
      countParams.push(kycStatus);
    }

    if (role) {
      countQuery += ' AND role = ?';
      countParams.push(role);
    }

    const { total } = await db.get(countQuery, countParams);

    res.json({
      users,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to retrieve users' });
  }
});

// Admin: Get single user
router.get('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.get(
      `SELECT id, email, firstName, lastName, phone, address, city, state,
              country, postalCode, dateOfBirth, kycStatus, kycVerifiedAt,
              role, status, createdAt, lastLoginAt, emailVerified, phoneVerified
       FROM users WHERE id = ?`,
      [id]
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's accounts
    const accounts = await db.all(
      'SELECT * FROM accounts WHERE userId = ?',
      [id]
    );

    // Get recent transactions
    const transactions = await db.all(
      `SELECT t.*, a.accountNumber 
       FROM transactions t
       JOIN accounts a ON t.accountId = a.id
       WHERE a.userId = ?
       ORDER BY t.createdAt DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      user,
      accounts,
      recentTransactions: transactions
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to retrieve user' });
  }
});

// Admin: Update user
router.put('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = [
      'firstName', 'lastName', 'phone', 'kycStatus', 
      'role', 'status', 'emailVerified', 'phoneVerified'
    ];

    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    await db.run(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );

    res.json({ message: 'User updated successfully' });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

module.exports = router;
