const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// 1. Get user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0, unreadOnly = false, type } = req.query;

    // FIX: Using quotes for "userId" and $1
    let query = 'SELECT * FROM notifications WHERE "userId" = $1';
    let params = [userId];

    if (unreadOnly === 'true') {
      query += ' AND "isRead" = false';
    }

    if (type) {
      query += ` AND type = $${params.length + 1}`;
      params.push(type);
    }

    query += ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const notifications = await db.all(query, params);

    // Get unread count
    const unreadData = await db.get(
      'SELECT COUNT(*) as "unreadCount" FROM notifications WHERE "userId" = $1 AND "isRead" = false',
      [userId]
    );

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE "userId" = $1';
    let countParams = [userId];

    if (type) {
      countQuery += ' AND type = $2';
      countParams.push(type);
    }

    const totalData = await db.get(countQuery, countParams);

    res.json({
      success: true,
      notifications,
      unreadCount: parseInt(unreadData.unreadCount || 0),
      pagination: {
        total: parseInt(totalData.total || 0),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve notifications' });
  }
});

// 2. Mark notification as read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const notification = await db.get(
      'SELECT * FROM notifications WHERE id = $1 AND "userId" = $2',
      [id, userId]
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    // FIX: Booleans and CURRENT_TIMESTAMP
    await db.run(
      'UPDATE notifications SET "isRead" = true, "readAt" = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({ success: true, message: 'Notification marked as read' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

// 3. Mark all notifications as read
router.put('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.run(
      'UPDATE notifications SET "isRead" = true, "readAt" = CURRENT_TIMESTAMP WHERE "userId" = $1 AND "isRead" = false',
      [userId]
    );

    res.json({ 
      success: true,
      message: 'All notifications marked as read',
      markedCount: result.changes
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark notifications' });
  }
});

// 4. Delete notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await db.get(
      'SELECT * FROM notifications WHERE id = $1 AND "userId" = $2',
      [id, userId]
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await db.run('DELETE FROM notifications WHERE id = $1', [id]);

    res.json({ success: true, message: 'Notification deleted' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
});

// 5. Internal Helper: createNotification (Preserved exact logic)
async function createNotification({ userId, type, title, message, data = null, sendEmail = false }) {
  try {
    const notifId = uuidv4();
    await db.run(
      `INSERT INTO notifications (id, "userId", type, title, message, data, "isRead", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP)`,
      [notifId, userId, type, title, message, data ? JSON.stringify(data) : null]
    );

    if (sendEmail) {
      const user = await db.get('SELECT email, "firstName" FROM users WHERE id = $1', [userId]);
      if (user) {
        const { sendEmail: sendEmailService } = require('../services/emailService');
        await sendEmailService({
          to: user.email,
          subject: title,
          template: 'notification',
          data: { name: user.firstName, title, message }
        });
      }
    }
    return notifId;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

// 6. Get notification preferences
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // FIX: Quoted table name
    let preferences = await db.get(
      'SELECT * FROM "notificationPreferences" WHERE "userId" = $1',
      [userId]
    );

    if (!preferences) {
      await db.run(
        `INSERT INTO "notificationPreferences" 
         (id, "userId", "emailTransactions", "emailSecurity", "emailMarketing", "emailStatements", 
          "pushTransactions", "pushSecurity", "pushMarketing", "createdAt")
         VALUES ($1, $2, true, true, false, true, true, true, false, CURRENT_TIMESTAMP)`,
        [uuidv4(), userId]
      );

      preferences = await db.get(
        'SELECT * FROM "notificationPreferences" WHERE "userId" = $1',
        [userId]
      );
    }

    res.json({ success: true, preferences });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve preferences' });
  }
});

// 7. Update notification preferences
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    const allowedFields = [
      'emailTransactions', 'emailSecurity', 'emailMarketing', 'emailStatements',
      'pushTransactions', 'pushSecurity', 'pushMarketing'
    ];

    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`"${field}" = $${values.length + 1}`);
        values.push(updates[field]); // Postgres accepts booleans directly
      }
    });

    if (fields.length === 0) return res.status(400).json({ message: 'No valid fields' });

    values.push(userId);
    await db.run(
      `UPDATE "notificationPreferences" SET ${fields.join(', ')} WHERE "userId" = $${values.length}`,
      values
    );

    const preferences = await db.get('SELECT * FROM "notificationPreferences" WHERE "userId" = $1', [userId]);
    res.json({ success: true, message: 'Preferences updated', preferences });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// 8. Get unread count
router.get('/count/unread', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { count } = await db.get(
      'SELECT COUNT(*) as count FROM notifications WHERE "userId" = $1 AND "isRead" = false',
      [userId]
    );
    res.json({ success: true, unreadCount: parseInt(count || 0) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get count' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;