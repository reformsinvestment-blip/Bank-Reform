const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); // Updated to use your dbAsync helper
const { sendEmail } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid'); 
const router = express.Router();

// 1. Create support ticket
router.post('/tickets', authenticate, [
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('category').isIn(['account', 'transaction', 'card', 'loan', 'technical', 'other']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { subject, category, priority = 'medium', message, attachments = null } = req.body;

    // Generate ticket number (Logic preserved)
    const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const ticketId = uuidv4();

    // FIX: Using quotes for "supportTickets", "userId", "ticketNumber", "createdAt"
    await db.run(
      `INSERT INTO "supportTickets" 
       (id, "userId", "ticketNumber", subject, category, priority, status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'open', CURRENT_TIMESTAMP)`,
      [ticketId, userId, ticketNumber, subject, category, priority]
    );

    // Add initial message - FIX: Quotes for "supportMessages", "ticketId", "senderType", "senderId"
    await db.run(
      `INSERT INTO "supportMessages" 
       ("id", "ticketId", "senderType", "senderId", message, attachments, "createdAt")
       VALUES ($1, $2, 'user', $3, $4, $5, CURRENT_TIMESTAMP)`,
      [uuidv4(), ticketId, userId, message, attachments ? JSON.stringify(attachments) : null]
    );

    // Send confirmation emails (Logic preserved)
    await sendEmail({
      to: req.user.email,
      subject: `Support Ticket Created - ${ticketNumber}`,
      template: 'supportTicketCreated',
      data: { name: req.user.firstName, ticketNumber, subject, category, priority }
    });

    // Notify admins
    const admins = await db.all('SELECT email, "firstName" FROM users WHERE role = $1', ['admin']);
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `New Support Ticket - ${ticketNumber}`,
        template: 'adminNewTicket',
        data: { name: admin.firstName, ticketNumber, subject, category, priority, userEmail: req.user.email }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      ticket: { id: ticketId, ticketNumber, subject, category, priority, status: 'open', createdAt: new Date().toISOString() }
    });

  } catch (error) {
    console.error('Create support ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to create support ticket' });
  }
});

// 2. Get user's support tickets
router.get('/tickets', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, category, limit = 20, offset = 0 } = req.query;

    let sql = 'SELECT * FROM "supportTickets" WHERE "userId" = $1';
    let params = [userId];

    if (status) {
      sql += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (category) {
      sql += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    sql += ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const tickets = await db.all(sql, params);

    // Get message count and last message time for each (Logic preserved)
    for (const ticket of tickets) {
      const msgData = await db.get('SELECT COUNT(*) as count FROM "supportMessages" WHERE "ticketId" = $1', [ticket.id]);
      ticket.messageCount = parseInt(msgData.count || 0);

      const lastMsg = await db.get('SELECT "createdAt" FROM "supportMessages" WHERE "ticketId" = $1 ORDER BY "createdAt" DESC LIMIT 1', [ticket.id]);
      ticket.lastMessageAt = lastMsg ? lastMsg.createdAt : null;
    }

    const countData = await db.get('SELECT COUNT(*) as total FROM "supportTickets" WHERE "userId" = $1', [userId]);

    res.json({
      success: true,
      tickets,
      pagination: { total: parseInt(countData.total), limit: parseInt(limit), offset: parseInt(offset) }
    });

  } catch (error) {
    console.error('Get support tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve tickets' });
  }
});

// 3. Get single ticket with messages
router.get('/tickets/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Get ticket - FIX: Quoted columns
    let sql = 'SELECT * FROM "supportTickets" WHERE id = $1';
    const params = [id];

    if (!isAdmin) {
      sql += ' AND "userId" = $2';
      params.push(userId);
    }

    const ticket = await db.get(sql, params);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    if (isAdmin) {
      const user = await db.get('SELECT "firstName", "lastName", email FROM users WHERE id = $1', [ticket.userId]);
      ticket.user = user;
    }

    // Get messages - FIX: Join logic with quotes and || concatenation
    const messages = await db.all(
      `SELECT sm.*, 
        CASE 
          WHEN sm."senderType" = 'user' THEN u."firstName" || ' ' || u."lastName"
          WHEN sm."senderType" = 'admin' THEN a."firstName" || ' ' || a."lastName"
          ELSE 'System'
        END as "senderName"
       FROM "supportMessages" sm
       LEFT JOIN users u ON sm."senderType" = 'user' AND sm."senderId" = u.id
       LEFT JOIN users a ON sm."senderType" = 'admin' AND sm."senderId" = a.id
       WHERE sm."ticketId" = $1
       ORDER BY sm."createdAt" ASC`,
      [id]
    );

    // Parse attachments (Preserved)
    messages.forEach(msg => {
      if (msg.attachments) {
        try { msg.attachments = JSON.parse(msg.attachments); } catch { msg.attachments = null; }
      }
    });

    res.json({ success: true, ticket, messages });

  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve ticket' });
  }
});
// --- CONTINUATION OF backend/routes/support.js ---

// 4. Add message to ticket
router.post('/tickets/:id/messages', authenticate, [
  param('id').notEmpty(),
  body('message').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { message, attachments = null } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Verify ticket exists - FIX: Quoted table and columns
    let sql = 'SELECT * FROM "supportTickets" WHERE id = $1';
    const params = [id];
    if (!isAdmin) {
      sql += ' AND "userId" = $2';
      params.push(userId);
    }

    const ticket = await db.get(sql, params);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    if (ticket.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Cannot add message to closed ticket' });
    }

    // Add message - FIX: Quoted table/columns and CURRENT_TIMESTAMP
    const msgId = uuidv4();
    await db.run(
      `INSERT INTO "supportMessages" 
       (id, "ticketId", "senderType", "senderId", message, attachments, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [msgId, id, isAdmin ? 'admin' : 'user', userId, message, attachments ? JSON.stringify(attachments) : null]
    );

    // Update ticket status (Logic preserved)
    if (isAdmin && ticket.status === 'open') {
      await db.run('UPDATE "supportTickets" SET status = $1 WHERE id = $2', ['in_progress', id]);
    } else if (!isAdmin && ticket.status === 'in_progress') {
      await db.run('UPDATE "supportTickets" SET status = $1 WHERE id = $2', ['awaiting_response', id]);
    }

    // Send notifications (Logic preserved)
    if (isAdmin) {
      const user = await db.get('SELECT email, "firstName" FROM users WHERE id = $1', [ticket.userId]);
      await sendEmail({
        to: user.email,
        subject: `New Response on Ticket ${ticket.ticketNumber}`,
        template: 'supportTicketResponse',
        data: { name: user.firstName, ticketNumber: ticket.ticketNumber, subject: ticket.subject }
      });
    } else {
      const admins = await db.all('SELECT email, "firstName" FROM users WHERE role = $1', ['admin']);
      for (const admin of admins) {
        await sendEmail({
          to: admin.email,
          subject: `New Message on Ticket ${ticket.ticketNumber}`,
          template: 'adminTicketMessage',
          data: { name: admin.firstName, ticketNumber: ticket.ticketNumber, subject: ticket.subject, userEmail: req.user.email }
        });
      }
    }

    res.status(201).json({ success: true, message: 'Message added successfully', messageId: msgId });

  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({ success: false, message: 'Failed to add message' });
  }
});

// 5. Close ticket
router.put('/tickets/:id/close', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    let sql = 'SELECT * FROM "supportTickets" WHERE id = $1';
    const params = [id];
    if (!isAdmin) { sql += ' AND "userId" = $2'; params.push(userId); }

    const ticket = await db.get(sql, params);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    // FIX: Quoted columns and CURRENT_TIMESTAMP
    await db.run(
      'UPDATE "supportTickets" SET status = $1, "closedAt" = CURRENT_TIMESTAMP WHERE id = $2',
      ['closed', id]
    );

    const user = await db.get('SELECT email, "firstName" FROM users WHERE id = $1', [ticket.userId]);
    await sendEmail({
      to: user.email,
      subject: `Ticket ${ticket.ticketNumber} Closed`,
      template: 'supportTicketClosed',
      data: { name: user.firstName, ticketNumber: ticket.ticketNumber, subject: ticket.subject }
    });

    res.json({ success: true, message: 'Ticket closed successfully' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to close ticket' });
  }
});

// 6. Admin: Get all tickets
router.get('/admin/tickets', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { status, category, priority, limit = 20, offset = 0 } = req.query;

    // FIX: JOIN and column quoting
    let query = `SELECT st.*, u."firstName", u."lastName", u.email
                 FROM "supportTickets" st
                 JOIN users u ON st."userId" = u.id
                 WHERE 1=1`;
    let params = [];

    if (status) { query += ` AND st.status = $${params.length + 1}`; params.push(status); }
    if (category) { query += ` AND st.category = $${params.length + 1}`; params.push(category); }
    if (priority) { query += ` AND st.priority = $${params.length + 1}`; params.push(priority); }

    query += ` ORDER BY st."createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const tickets = await db.all(query, params);

    // Get stats - FIX: Quoted table name
    const stats = await db.get(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as "inProgress",
        SUM(CASE WHEN status = 'awaiting_response' THEN 1 ELSE 0 END) as "awaitingResponse",
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
       FROM "supportTickets"`
    );

    res.json({ success: true, tickets, stats, pagination: { total: parseInt(stats.total), limit: parseInt(limit), offset: parseInt(offset) } });

  } catch (error) {
    console.error('Admin tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve tickets' });
  }
});

// 7. Admin: Update ticket
router.put('/admin/tickets/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const ticket = await db.get('SELECT * FROM "supportTickets" WHERE id = $1', [id]);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const allowedFields = ['status', 'priority', 'assignedTo'];
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
    await db.run(`UPDATE "supportTickets" SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

    // Status change notification (Logic preserved)
    if (updates.status && updates.status !== ticket.status) {
      const user = await db.get('SELECT email, "firstName" FROM users WHERE id = $1', [ticket.userId]);
      await sendEmail({
        to: user.email,
        subject: `Ticket ${ticket.ticketNumber} Status Updated`,
        template: 'supportTicketStatusUpdate',
        data: { name: user.firstName, ticketNumber: ticket.ticketNumber, subject: ticket.subject, status: updates.status }
      });
    }

    res.json({ success: true, message: 'Ticket updated successfully' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

module.exports = router;