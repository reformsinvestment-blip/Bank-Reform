const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const db = require('../database/db');
const router = express.Router();

// Get user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      limit = 20, 
      offset = 0, 
      unreadOnly = false,
      type 
    } = req.query;

    let query = 'SELECT * FROM notifications WHERE userId = ?';
    let params = [userId];

    if (unreadOnly === 'true') {
      query += ' AND isRead = 0';
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const notifications = await db.all(query, params);

    // Get unread count
    const { unreadCount } = await db.get(
      'SELECT COUNT(*) as unreadCount FROM notifications WHERE userId = ? AND isRead = 0',
      [userId]
    );

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE userId = ?';
    let countParams = [userId];

    if (type) {
      countQuery += ' AND type = ?';
      countParams.push(type);
    }

    const { total } = await db.get(countQuery, countParams);

    res.json({
      notifications,
      unreadCount,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Failed to retrieve notifications' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticate, [
  param('id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;

    // Verify notification belongs to user
    const notification = await db.get(
      'SELECT * FROM notifications WHERE id = ? AND userId = ?',
      [id, userId]
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await db.run(
      'UPDATE notifications SET isRead = 1, readAt = datetime("now") WHERE id = ?',
      [id]
    );

    res.json({ message: 'Notification marked as read' });

  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.run(
      'UPDATE notifications SET isRead = 1, readAt = datetime("now") WHERE userId = ? AND isRead = 0',
      [userId]
    );

    res.json({ 
      message: 'All notifications marked as read',
      markedCount: result.changes
    });

  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
});

// Delete notification
router.delete('/:id', authenticate, [
  param('id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;

    // Verify notification belongs to user
    const notification = await db.get(
      'SELECT * FROM notifications WHERE id = ? AND userId = ?',
      [id, userId]
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await db.run(
      'DELETE FROM notifications WHERE id = ?',
      [id]
    );

    res.json({ message: 'Notification deleted' });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

// Create notification (internal use - for other routes to call)
async function createNotification({ userId, type, title, message, data = null, sendEmail = false }) {
  try {
    const result = await db.run(
      `INSERT INTO notifications (userId, type, title, message, data, isRead, createdAt)
       VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
      [userId, type, title, message, data ? JSON.stringify(data) : null]
    );

    if (sendEmail) {
      const user = await db.get('SELECT email, firstName FROM users WHERE id = ?', [userId]);
      if (user) {
        const { sendEmail: sendEmailService } = require('../services/emailService');
        await sendEmailService({
          to: user.email,
          subject: title,
          template: 'notification',
          data: {
            name: user.firstName,
            title,
            message
          }
        });
      }
    }

    return result.id;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

// Get notification preferences
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    let preferences = await db.get(
      'SELECT * FROM notificationPreferences WHERE userId = ?',
      [userId]
    );

    // Create default preferences if not exists
    if (!preferences) {
      await db.run(
        `INSERT INTO notificationPreferences 
         (userId, emailTransactions, emailSecurity, emailMarketing, emailStatements, 
          pushTransactions, pushSecurity, pushMarketing, createdAt)
         VALUES (?, 1, 1, 0, 1, 1, 1, 0, datetime('now'))`,
        [userId]
      );

      preferences = await db.get(
        'SELECT * FROM notificationPreferences WHERE userId = ?',
        [userId]
      );
    }

    res.json({ preferences });

  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({ message: 'Failed to retrieve notification preferences' });
  }
});

// Update notification preferences
router.put('/preferences', authenticate, [
  body('emailTransactions').optional().isBoolean(),
  body('emailSecurity').optional().isBoolean(),
  body('emailMarketing').optional().isBoolean(),
  body('emailStatements').optional().isBoolean(),
  body('pushTransactions').optional().isBoolean(),
  body('pushSecurity').optional().isBoolean(),
  body('pushMarketing').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const updates = req.body;

    // Build update query dynamically
    const allowedFields = [
      'emailTransactions', 'emailSecurity', 'emailMarketing', 'emailStatements',
      'pushTransactions', 'pushSecurity', 'pushMarketing'
    ];

    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field] ? 1 : 0);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    // Check if preferences exist
    const existing = await db.get(
      'SELECT * FROM notificationPreferences WHERE userId = ?',
      [userId]
    );

    if (existing) {
      await db.run(
        `UPDATE notificationPreferences SET ${fields.join(', ')} WHERE userId = ?`,
        [...values, userId]
      );
    } else {
      await db.run(
        `INSERT INTO notificationPreferences 
         (userId, ${allowedFields.join(', ')}, createdAt)
         VALUES (?, ${allowedFields.map(() => '?').join(', ')}, datetime('now'))`,
        [userId, ...allowedFields.map(f => updates[f] ? 1 : 0)]
      );
    }

    const preferences = await db.get(
      'SELECT * FROM notificationPreferences WHERE userId = ?',
      [userId]
    );

    res.json({ 
      message: 'Notification preferences updated',
      preferences
    });

  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ message: 'Failed to update notification preferences' });
  }
});

// Get unread notification count (for badge)
router.get('/count/unread', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const { count } = await db.get(
      'SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0',
      [userId]
    );

    res.json({ unreadCount: count });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Failed to get unread count' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
