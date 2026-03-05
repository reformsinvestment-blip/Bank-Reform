const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db');
const { sendEmail } = require('../services/emailService');
const crypto = require('crypto');
const router = express.Router();
const { v4: uuidv4 } = require('uuid'); 

// Helper to mask card number
function maskCardNumber(cardNumber) {
  return cardNumber.replace(/(\d{4})(\d{8})(\d{4})/, '$1********$3');
}

// Helper to generate card number (test format)
function generateCardNumber() {
  return '4' + Array(15).fill(0).map(() => Math.floor(Math.random() * 10)).join('');
}

// Helper to generate CVV
function generateCVV() {
  return Math.floor(100 + Math.random() * 900).toString();
}

// Helper to generate PIN
function generatePIN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Get user's cards
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const cards = await db.all(
      `SELECT c.*, a.accountNumber, a.accountType
       FROM cards c
       JOIN accounts a ON c.accountId = a.id
       WHERE c.userId = 1$
       ORDER BY c.createdAt DESC`,
      [userId]
    );
       cards.forEach(card => {
      card.cardNumber = maskCardNumber(card.cardNumber);
      delete card.cvv;
      delete card.pin;
    });

    res.json({ cards });
  } catch (error) {
    console.error('Get cards error:', error);
    res.status(500).json({ message: 'Failed to retrieve cards' });
  }
});
      

// Get single card
router.get('/:id', authenticate, [
  param('id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;

    const card = await db.get(
      `SELECT c.*, a.accountNumber, a.accountType, a.balance as accountBalance
       FROM cards c
       JOIN accounts a ON c.accountId = a.id
       WHERE c.id = ? AND c.userId = ?`,
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Mask sensitive data
    card.cardNumber = maskCardNumber(card.cardNumber);
    delete card.cvv;
    delete card.pin;

    res.json({ card });

  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({ message: 'Failed to retrieve card' });
  }
});



// Request new card
router.post('/', authenticate, [
  body('accountId').notEmpty(),
  body('cardType').isIn(['debit', 'credit']),
  body('cardBrand').optional().isIn(['visa', 'mastercard']),
  body('dailyLimit').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { 
      accountId, 
      cardType, 
      cardBrand = 'visa',
      dailyLimit = 5000 
    } = req.body;

    // 1. Verify account belongs to user (Updated for Postgres)
    const account = await db.get(
      'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
      [accountId, userId]
    );

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // 2. Check card limit (Updated for Postgres)
    const cardData = await db.get(
      'SELECT COUNT(*) as "cardCount" FROM cards WHERE "accountId" = $1 AND status != $2',
      [accountId, 'cancelled']
    );

    if (parseInt(cardData.cardCount) >= 3) {
      return res.status(400).json({ message: 'Maximum cards limit reached for this account' });
    }

    // 3. Generate card details (Keeping your exact logic)
    const cardNumber = generateCardNumber();
    const cvv = generateCVV();
    const pin = generatePIN();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 4);
    const expiryMonth = (expiryDate.getMonth() + 1).toString().padStart(2, '0');
    const expiryYear = expiryDate.getFullYear().toString().slice(-2);

    // Hash sensitive data (Keeping your exact logic)
    const hashedCVV = crypto.createHash('sha256').update(cvv).digest('hex');
    const hashedPIN = crypto.createHash('sha256').update(pin).digest('hex');
    
    // Generate a UUID for the card ID
    const cardId = uuidv4();

    // 4. Insert into PostgreSQL (Updated Quotes, Placeholders, and Date function)
    const result = await db.run(
      `INSERT INTO cards 
       (id, "userId", "accountId", "cardNumber", "cardType", "cardBrand", "expiryMonth", "expiryYear", 
        cvv, pin, status, "dailyLimit", "currentDailySpend", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, 0, CURRENT_TIMESTAMP)
       RETURNING id`,
      [cardId, userId, accountId, cardNumber, cardType, cardBrand, expiryMonth, expiryYear, 
       hashedCVV, hashedPIN, dailyLimit]
    );

    // 5. Send card details email (EXACTLY AS IN YOUR ORIGINAL CODE)
    await sendEmail({
      to: req.user.email,
      subject: 'Your New Card Details',
      template: 'newCard',
      data: {
        name: req.user.firstName,
        cardType: cardType.charAt(0).toUpperCase() + cardType.slice(1),
        cardBrand: cardBrand.toUpperCase(),
        cardNumber: maskCardNumber(cardNumber),
        expiryMonth,
        expiryYear,
        cvv,
        pin,
        dailyLimit
      }
    });

    // 6. Send Response (EXACTLY AS IN YOUR ORIGINAL CODE)
    res.status(201).json({
      success: true,
      message: 'Card created successfully',
      card: {
        id: cardId, // Using the ID we generated
        cardNumber: maskCardNumber(cardNumber),
        cardType,
        cardBrand,
        expiryMonth,
        expiryYear,
        status: 'active',
        dailyLimit
      },
      securityInfo: {
        message: 'CVV and PIN have been sent to your email',
        cvv,
        pin
      }
    });

  } catch (error) {
    console.error('Create card error:', error);
    res.status(500).json({ success: false, message: 'Failed to create card' });
  }
});


// Freeze/Unfreeze card
router.put('/:id/freeze', authenticate, [
  param('id').isInt(),
  body('freeze').isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { freeze } = req.body;
    const userId = req.user.id;

    const card = await db.get(
      'SELECT * FROM cards WHERE id = ? AND userId = ?',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    if (card.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot modify cancelled card' });
    }

    const newStatus = freeze ? 'frozen' : 'active';

    await db.run(
      'UPDATE cards SET status = ? WHERE id = ?',
      [newStatus, id]
    );

    // Send notification
    await sendEmail({
      to: req.user.email,
      subject: `Card ${freeze ? 'Frozen' : 'Unfrozen'}`,
      template: 'cardStatusChange',
      data: {
        name: req.user.firstName,
        cardNumber: maskCardNumber(card.cardNumber),
        status: newStatus,
        action: freeze ? 'frozen' : 'unfrozen'
      }
    });

    res.json({ 
      message: `Card ${freeze ? 'frozen' : 'unfrozen'} successfully`,
      status: newStatus
    });

  } catch (error) {
    console.error('Freeze card error:', error);
    res.status(500).json({ message: 'Failed to update card status' });
  }
});

// Change card PIN
router.put('/:id/pin', authenticate, [
  param('id').isInt(),
  body('currentPin').isLength({ min: 4, max: 4 }),
  body('newPin').isLength({ min: 4, max: 4 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { currentPin, newPin } = req.body;
    const userId = req.user.id;

    const card = await db.get(
      'SELECT * FROM cards WHERE id = ? AND userId = ?',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Verify current PIN
    const hashedCurrentPin = crypto.createHash('sha256').update(currentPin).digest('hex');
    if (hashedCurrentPin !== card.pin) {
      return res.status(400).json({ message: 'Current PIN is incorrect' });
    }

    // Update PIN
    const hashedNewPin = crypto.createHash('sha256').update(newPin).digest('hex');
    await db.run(
      'UPDATE cards SET pin = ? WHERE id = ?',
      [hashedNewPin, id]
    );

    // Send notification
    await sendEmail({
      to: req.user.email,
      subject: 'Card PIN Changed',
      template: 'cardPINChanged',
      data: {
        name: req.user.firstName,
        cardNumber: maskCardNumber(card.cardNumber)
      }
    });

    res.json({ message: 'PIN changed successfully' });

  } catch (error) {
    console.error('Change PIN error:', error);
    res.status(500).json({ message: 'Failed to change PIN' });
  }
});

// Update card limits
router.put('/:id/limits', authenticate, [
  param('id').isInt(),
  body('dailyLimit').optional().isFloat({ min: 0 }),
  body('transactionLimit').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { dailyLimit, transactionLimit } = req.body;
    const userId = req.user.id;

    const card = await db.get(
      'SELECT * FROM cards WHERE id = ? AND userId = ?',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const updates = [];
    const values = [];

    if (dailyLimit !== undefined) {
      updates.push('dailyLimit = ?');
      values.push(dailyLimit);
    }

    if (transactionLimit !== undefined) {
      updates.push('transactionLimit = ?');
      values.push(transactionLimit);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No limits to update' });
    }

    await db.run(
      `UPDATE cards SET ${updates.join(', ')} WHERE id = ?`,
      [...values, id]
    );

    res.json({ message: 'Card limits updated successfully' });

  } catch (error) {
    console.error('Update limits error:', error);
    res.status(500).json({ message: 'Failed to update card limits' });
  }
});

// Report lost/stolen card
router.put('/:id/report', authenticate, [
  param('id').isInt(),
  body('reason').isIn(['lost', 'stolen', 'damaged', 'fraud'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const card = await db.get(
      'SELECT * FROM cards WHERE id = ? AND userId = ?',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    await db.run(
      'UPDATE cards SET status = ? WHERE id = ?',
      ['cancelled', id]
    );

    // Log the report
    await db.run(
      `INSERT INTO cardReports (cardId, userId, reason, reportedAt)
       VALUES (?, ?, ?, datetime('now'))`,
      [id, userId, reason]
    );

    // Send notification
    await sendEmail({
      to: req.user.email,
      subject: 'Card Reported',
      template: 'cardReported',
      data: {
        name: req.user.firstName,
        cardNumber: maskCardNumber(card.cardNumber),
        reason: reason.charAt(0).toUpperCase() + reason.slice(1)
      }
    });

    res.json({ 
      message: 'Card reported successfully. A new card can be requested.',
      status: 'cancelled'
    });

  } catch (error) {
    console.error('Report card error:', error);
    res.status(500).json({ message: 'Failed to report card' });
  }
});

// Get card transactions
router.get('/:id/transactions', authenticate, [
  param('id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const card = await db.get(
      'SELECT * FROM cards WHERE id = ? AND userId = ?',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const transactions = await db.all(
      `SELECT * FROM cardTransactions 
       WHERE cardId = ?
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [id, parseInt(limit), parseInt(offset)]
    );

    const { total } = await db.get(
      'SELECT COUNT(*) as total FROM cardTransactions WHERE cardId = ?',
      [id]
    );

    res.json({
      transactions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get card transactions error:', error);
    res.status(500).json({ message: 'Failed to retrieve card transactions' });
  }
});

// Admin: Get all cards
router.get('/admin/all', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    let query = `SELECT c.*, u.firstName, u.lastName, u.email, a.accountNumber
                 FROM cards c
                 JOIN users u ON c.userId = u.id
                 JOIN accounts a ON c.accountId = a.id
                 WHERE 1=1`;
    let params = [];

    if (status) {
      query += ' AND c.status = ?';
      params.push(status);
    }

    query += ' ORDER BY c.createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const cards = await db.all(query, params);

    // Mask sensitive data
    cards.forEach(card => {
      card.cardNumber = maskCardNumber(card.cardNumber);
      delete card.cvv;
      delete card.pin;
    });

    res.json({ cards });

  } catch (error) {
    console.error('Get all cards error:', error);
    res.status(500).json({ message: 'Failed to retrieve cards' });
  }
});

// Admin: Update card status
router.put('/admin/:id/status', authenticate, authorizeAdmin, [
  param('id').isInt(),
  body('status').isIn(['active', 'frozen', 'cancelled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;

    const card = await db.get('SELECT * FROM cards WHERE id = ?', [id]);
    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    await db.run(
      'UPDATE cards SET status = ? WHERE id = ?',
      [status, id]
    );

    // Notify user
    const user = await db.get('SELECT email, firstName FROM users WHERE id = ?', [card.userId]);
    await sendEmail({
      to: user.email,
      subject: 'Card Status Updated',
      template: 'adminCardStatusUpdate',
      data: {
        name: user.firstName,
        cardNumber: maskCardNumber(card.cardNumber),
        status
      }
    });

    res.json({ message: 'Card status updated successfully' });

  } catch (error) {
    console.error('Update card status error:', error);
    res.status(500).json({ message: 'Failed to update card status' });
  }
});

module.exports = router;
