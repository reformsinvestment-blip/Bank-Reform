const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const db = require('../database/db');
const { sendEmail } = require('../services/emailService');
const router = express.Router();

// Create support ticket
router.post('/tickets', authenticate, [
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('category').isIn(['account', 'transaction', 'card', 'loan', 'technical', 'other']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { subject, category, priority = 'medium', message, attachments = null } = req.body;

    // Generate ticket number
    const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const result = await db.run(
      `INSERT INTO supportTickets 
       (userId, ticketNumber, subject, category, priority, status, createdAt)
       VALUES (?, ?, ?, ?, ?, 'open', datetime('now'))`,
      [userId, ticketNumber, subject, category, priority]
    );

    const ticketId = result.id;

    // Add initial message
    await db.run(
      `INSERT INTO supportMessages 
       (ticketId, senderType, senderId, message, attachments, createdAt)
       VALUES (?, 'user', ?, ?, ?, datetime('now'))`,
      [ticketId, userId, message, attachments ? JSON.stringify(attachments) : null]
    );

    // Send confirmation email
    await sendEmail({
      to: req.user.email,
      subject: `Support Ticket Created - ${ticketNumber}`,
      template: 'supportTicketCreated',
      data: {
        name: req.user.firstName,
        ticketNumber,
        subject,
        category,
        priority
      }
    });

    // Notify admins
    const admins = await db.all('SELECT email, firstName FROM users WHERE role = ?', ['admin']);
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `New Support Ticket - ${ticketNumber}`,
        template: 'adminNewTicket',
        data: {
          name: admin.firstName,
          ticketNumber,
          subject,
          category,
          priority,
          userEmail: req.user.email
        }
      });
    }

    res.status(201).json({
      message: 'Support ticket created successfully',
      ticket: {
        id: ticketId,
        ticketNumber,
        subject,
        category,
        priority,
        status: 'open',
        createdAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Create support ticket error:', error);
    res.status(500).json({ message: 'Failed to create support ticket' });
  }
});

// Get user's support tickets
router.get('/tickets', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      status, 
      category, 
      limit = 20, 
      offset = 0 
    } = req.query;

    let query = 'SELECT * FROM supportTickets WHERE userId = ?';
    let params = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const tickets = await db.all(query, params);

    // Get message count for each ticket
    for (const ticket of tickets) {
      const { count } = await db.get(
        'SELECT COUNT(*) as count FROM supportMessages WHERE ticketId = ?',
        [ticket.id]
      );
      ticket.messageCount = count;

      // Get last message time
      const lastMessage = await db.get(
        'SELECT createdAt FROM supportMessages WHERE ticketId = ? ORDER BY createdAt DESC LIMIT 1',
        [ticket.id]
      );
      ticket.lastMessageAt = lastMessage ? lastMessage.createdAt : null;
    }

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM supportTickets WHERE userId = ?';
    let countParams = [userId];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (category) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }

    const { total } = await db.get(countQuery, countParams);

    res.json({
      tickets,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get support tickets error:', error);
    res.status(500).json({ message: 'Failed to retrieve support tickets' });
  }
});

// Get single ticket with messages
router.get('/tickets/:id', authenticate, [
  param('id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Get ticket
    let query = 'SELECT * FROM supportTickets WHERE id = ?';
    if (!isAdmin) {
      query += ' AND userId = ?';
    }

    const params = [id];
    if (!isAdmin) {
      params.push(userId);
    }

    const ticket = await db.get(query, params);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Get user info if admin
    if (isAdmin) {
      const user = await db.get(
        'SELECT firstName, lastName, email FROM users WHERE id = ?',
        [ticket.userId]
      );
      ticket.user = user;
    }

    // Get messages
    const messages = await db.all(
      `SELECT sm.*, 
        CASE 
          WHEN sm.senderType = 'user' THEN u.firstName || ' ' || u.lastName
          WHEN sm.senderType = 'admin' THEN a.firstName || ' ' || a.lastName
          ELSE 'System'
        END as senderName
       FROM supportMessages sm
       LEFT JOIN users u ON sm.senderType = 'user' AND sm.senderId = u.id
       LEFT JOIN users a ON sm.senderType = 'admin' AND sm.senderId = a.id
       WHERE sm.ticketId = ?
       ORDER BY sm.createdAt ASC`,
      [id]
    );

    // Parse attachments
    messages.forEach(msg => {
      if (msg.attachments) {
        try {
          msg.attachments = JSON.parse(msg.attachments);
        } catch {
          msg.attachments = null;
        }
      }
    });

    res.json({
      ticket,
      messages
    });

  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ message: 'Failed to retrieve ticket' });
  }
});

// Add message to ticket
router.post('/tickets/:id/messages', authenticate, [
  param('id').isInt(),
  body('message').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { message, attachments = null } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Verify ticket exists and user has access
    let query = 'SELECT * FROM supportTickets WHERE id = ?';
    if (!isAdmin) {
      query += ' AND userId = ?';
    }

    const params = [id];
    if (!isAdmin) {
      params.push(userId);
    }

    const ticket = await db.get(query, params);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({ message: 'Cannot add message to closed ticket' });
    }

    // Add message
    const result = await db.run(
      `INSERT INTO supportMessages 
       (ticketId, senderType, senderId, message, attachments, createdAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [id, isAdmin ? 'admin' : 'user', userId, message, attachments ? JSON.stringify(attachments) : null]
    );

    // Update ticket status
    if (isAdmin && ticket.status === 'open') {
      await db.run(
        'UPDATE supportTickets SET status = ? WHERE id = ?',
        ['in_progress', id]
      );
    } else if (!isAdmin && ticket.status === 'in_progress') {
      await db.run(
        'UPDATE supportTickets SET status = ? WHERE id = ?',
        ['awaiting_response', id]
      );
    }

    // Send notification email
    if (isAdmin) {
      // Notify user
      const user = await db.get('SELECT email, firstName FROM users WHERE id = ?', [ticket.userId]);
      await sendEmail({
        to: user.email,
        subject: `New Response on Ticket ${ticket.ticketNumber}`,
        template: 'supportTicketResponse',
        data: {
          name: user.firstName,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject
        }
      });
    } else {
      // Notify admins
      const admins = await db.all('SELECT email, firstName FROM users WHERE role = ?', ['admin']);
      for (const admin of admins) {
        await sendEmail({
          to: admin.email,
          subject: `New Message on Ticket ${ticket.ticketNumber}`,
          template: 'adminTicketMessage',
          data: {
            name: admin.firstName,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            userEmail: req.user.email
          }
        });
      }
    }

    res.status(201).json({
      message: 'Message added successfully',
      messageId: result.id
    });

  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({ message: 'Failed to add message' });
  }
});

// Close ticket
router.put('/tickets/:id/close', authenticate, [
  param('id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    let query = 'SELECT * FROM supportTickets WHERE id = ?';
    if (!isAdmin) {
      query += ' AND userId = ?';
    }

    const params = [id];
    if (!isAdmin) {
      params.push(userId);
    }

    const ticket = await db.get(query, params);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    await db.run(
      'UPDATE supportTickets SET status = ?, closedAt = datetime("now") WHERE id = ?',
      ['closed', id]
    );

    // Send closure notification
    const user = await db.get('SELECT email, firstName FROM users WHERE id = ?', [ticket.userId]);
    await sendEmail({
      to: user.email,
      subject: `Ticket ${ticket.ticketNumber} Closed`,
      template: 'supportTicketClosed',
      data: {
        name: user.firstName,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject
      }
    });

    res.json({ message: 'Ticket closed successfully' });

  } catch (error) {
    console.error('Close ticket error:', error);
    res.status(500).json({ message: 'Failed to close ticket' });
  }
});

// Admin: Get all tickets
router.get('/admin/tickets', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { 
      status, 
      category, 
      priority,
      limit = 20, 
      offset = 0 
    } = req.query;

    let query = `SELECT st.*, u.firstName, u.lastName, u.email
                 FROM supportTickets st
                 JOIN users u ON st.userId = u.id
                 WHERE 1=1`;
    let params = [];

    if (status) {
      query += ' AND st.status = ?';
      params.push(status);
    }

    if (category) {
      query += ' AND st.category = ?';
      params.push(category);
    }

    if (priority) {
      query += ' AND st.priority = ?';
      params.push(priority);
    }

    query += ' ORDER BY st.createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const tickets = await db.all(query, params);

    // Get stats
    const stats = await db.get(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN status = 'awaiting_response' THEN 1 ELSE 0 END) as awaitingResponse,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
       FROM supportTickets`
    );

    res.json({
      tickets,
      stats,
      pagination: {
        total: stats.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get all tickets error:', error);
    res.status(500).json({ message: 'Failed to retrieve tickets' });
  }
});

// Admin: Update ticket
router.put('/admin/tickets/:id', authenticate, authorizeAdmin, [
  param('id').isInt(),
  body('status').optional().isIn(['open', 'in_progress', 'awaiting_response', 'closed']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('assignedTo').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updates = req.body;

    const ticket = await db.get('SELECT * FROM supportTickets WHERE id = ?', [id]);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const allowedFields = ['status', 'priority', 'assignedTo'];
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
      `UPDATE supportTickets SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );

    // Send notification if status changed
    if (updates.status && updates.status !== ticket.status) {
      const user = await db.get('SELECT email, firstName FROM users WHERE id = ?', [ticket.userId]);
      await sendEmail({
        to: user.email,
        subject: `Ticket ${ticket.ticketNumber} Status Updated`,
        template: 'supportTicketStatusUpdate',
        data: {
          name: user.firstName,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          status: updates.status
        }
      });
    }

    res.json({ message: 'Ticket updated successfully' });

  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ message: 'Failed to update ticket' });
  }
});

module.exports = router;
