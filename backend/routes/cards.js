const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); // Points to your smart db.js
const { sendEmail } = require('../services/emailService');
const crypto = require('crypto');
const router = express.Router();
const { v4: uuidv4 } = require('uuid'); 

/**
 * HELPERS (Logic preserved exactly)
 */
function maskCardNumber(cardNumber) {
  return cardNumber.replace(/(\d{4})(\d{8})(\d{4})/, '$1********$3');
}

function generateCardNumber() {
  return '4' + Array(15).fill(0).map(() => Math.floor(Math.random() * 10)).join('');
}

function generateCVV() {
  return Math.floor(100 + Math.random() * 900).toString();
}

function generatePIN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * 1. GET USER'S CARDS
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // FIX: Using quotes for "userId", "accountId", "createdAt" and placeholder $1
    const cards = await db.all(
      `SELECT c.*, a."accountNumber", a."accountType"
       FROM cards c
       JOIN accounts a ON c."accountId" = a.id
       WHERE c."userId" = $1
       ORDER BY c."createdAt" DESC`,
      [userId]
    );

    cards.forEach(card => {
      card.cardNumber = maskCardNumber(card.cardNumber);
      delete card.cvv;
      delete card.pin;
    });

    res.json({ success: true, cards });
  } catch (error) {
    console.error('Get cards error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve cards' });
  }
});
      
/**
 * 2. GET SINGLE CARD
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // FIX: Quotes for "accountNumber", "accountType", "userId" and $ placeholders
    const card = await db.get(
      `SELECT c.*, a."accountNumber", a."accountType", a.balance as "accountBalance"
       FROM cards c
       JOIN accounts a ON c."accountId" = a.id
       WHERE c.id = $1 AND c."userId" = $2`,
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    card.cardNumber = maskCardNumber(card.cardNumber);
    delete card.cvv;
    delete card.pin;

    res.json({ success: true, card });

  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve card' });
  }
});

/**
 * 3. REQUEST NEW CARD
 */
router.post('/', authenticate, [
  body('accountId').notEmpty(),
  body('cardType').isIn(['debit', 'credit']),
  body('cardBrand').optional().isIn(['visa', 'mastercard']),
  body('dailyLimit').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { 
      accountId, 
      cardType, 
      cardBrand = 'visa',
      dailyLimit = 5000 
    } = req.body;

    // Verify account belongs to user
    const account = await db.get(
      'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
      [accountId, userId]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Check card limit
    const cardData = await db.get(
      'SELECT COUNT(*) as "cardCount" FROM cards WHERE "accountId" = $1 AND status != $2',
      [accountId, 'cancelled']
    );

    if (parseInt(cardData.cardCount) >= 3) {
      return res.status(400).json({ success: false, message: 'Maximum cards limit reached for this account' });
    }

    const cardNumber = generateCardNumber();
    const cvv = generateCVV();
    const pin = generatePIN();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 4);
    const expiryMonth = (expiryDate.getMonth() + 1).toString().padStart(2, '0');
    const expiryYear = expiryDate.getFullYear().toString().slice(-2);

    const hashedCVV = crypto.createHash('sha256').update(cvv).digest('hex');
    const hashedPIN = crypto.createHash('sha256').update(pin).digest('hex');
    const cardId = uuidv4();

    // FIX: Using Quotes, $ placeholders, and CURRENT_TIMESTAMP for PostgreSQL
    await db.run(
      `INSERT INTO cards 
       (id, "userId", "accountId", "cardNumber", "cardType", "cardBrand", "expiryMonth", "expiryYear", 
        cvv, pin, status, "dailyLimit", "currentDailySpend", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, 0, CURRENT_TIMESTAMP)`,
      [cardId, userId, accountId, cardNumber, cardType, cardBrand, expiryMonth, expiryYear, 
       hashedCVV, hashedPIN, dailyLimit]
    );

    // Send card details email (Preserved logic)
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

    res.status(201).json({
      success: true,
      message: 'Card created successfully',
      card: {
        id: cardId,
        cardNumber: maskCardNumber(cardNumber),
        cardType,
        cardBrand,
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

/**
 * 4. FREEZE/UNFREEZE CARD
 */
router.put('/:id/freeze', authenticate, [
  body('freeze').isBoolean()
], async (req, res) => {
  try {
    const { id } = req.params;
    const { freeze } = req.body;
    const userId = req.user.id;

    const card = await db.get(
      'SELECT * FROM cards WHERE id = $1 AND "userId" = $2',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    if (card.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot modify cancelled card' });
    }

    const newStatus = freeze ? 'frozen' : 'active';

    await db.run('UPDATE cards SET status = $1 WHERE id = $2', [newStatus, id]);

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
      success: true,
      message: `Card ${freeze ? 'frozen' : 'unfrozen'} successfully`,
      status: newStatus
    });

  } catch (error) {
    console.error('Freeze card error:', error);
    res.status(500).json({ success: false, message: 'Failed to update card status' });
  }
});

// --- CONTINUATION OF backend/routes/cards.js ---

// 4. Change card PIN
router.put('/:id/pin', authenticate, [
  param('id').notEmpty(), // Adjusted to notEmpty for UUID strings
  body('currentPin').isLength({ min: 4, max: 4 }),
  body('newPin').isLength({ min: 4, max: 4 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { currentPin, newPin } = req.body;
    const userId = req.user.id;

    // FIX: Added quotes for "userId" and $ placeholders
    const card = await db.get(
      'SELECT * FROM cards WHERE id = $1 AND "userId" = $2',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    // Verify current PIN (Logic preserved exactly)
    const hashedCurrentPin = crypto.createHash('sha256').update(currentPin).digest('hex');
    if (hashedCurrentPin !== card.pin) {
      return res.status(400).json({ success: false, message: 'Current PIN is incorrect' });
    }

    // Update PIN
    const hashedNewPin = crypto.createHash('sha256').update(newPin).digest('hex');
    await db.run(
      'UPDATE cards SET pin = $1 WHERE id = $2',
      [hashedNewPin, id]
    );

    // Send notification email (Logic preserved exactly)
    await sendEmail({
      to: req.user.email,
      subject: 'Card PIN Changed',
      template: 'cardPINChanged',
      data: {
        name: req.user.firstName,
        cardNumber: maskCardNumber(card.cardNumber)
      }
    });

    res.json({ success: true, message: 'PIN changed successfully' });

  } catch (error) {
    console.error('Change PIN error:', error);
    res.status(500).json({ success: false, message: 'Failed to change PIN' });
  }
});

// 5. Update card limits
router.put('/:id/limits', authenticate, [
  param('id').notEmpty(),
  body('dailyLimit').optional().isFloat({ min: 0 }),
  body('transactionLimit').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { dailyLimit, transactionLimit } = req.body;
    const userId = req.user.id;

    // FIX: Quotes for "userId"
    const card = await db.get(
      'SELECT * FROM cards WHERE id = $1 AND "userId" = $2',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    const updates = [];
    const values = [];

    if (dailyLimit !== undefined) {
      updates.push('"dailyLimit" = $' + (values.length + 1));
      values.push(dailyLimit);
    }

    if (transactionLimit !== undefined) {
      updates.push('"transactionLimit" = $' + (values.length + 1));
      values.push(transactionLimit);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No limits to update' });
    }

    values.push(id);
    await db.run(
      `UPDATE cards SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );

    res.json({ success: true, message: 'Card limits updated successfully' });

  } catch (error) {
    console.error('Update limits error:', error);
    res.status(500).json({ success: false, message: 'Failed to update card limits' });
  }
});

// 6. Report lost/stolen card
router.put('/:id/report', authenticate, [
  param('id').notEmpty(),
  body('reason').isIn(['lost', 'stolen', 'damaged', 'fraud'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const card = await db.get(
      'SELECT * FROM cards WHERE id = $1 AND "userId" = $2',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    await db.run('UPDATE cards SET status = $1 WHERE id = $2', ['cancelled', id]);

    // FIX: Using quotes for "cardReports" and "reportedAt" and CURRENT_TIMESTAMP
    await db.run(
      `INSERT INTO "cardReports" (id, "cardId", "userId", reason, "reportedAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [uuidv4(), id, userId, reason]
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
      success: true,
      message: 'Card reported successfully. A new card can be requested.',
      status: 'cancelled'
    });

  } catch (error) {
    console.error('Report card error:', error);
    res.status(500).json({ success: false, message: 'Failed to report card' });
  }
});

// 7. Get card transactions
router.get('/:id/transactions', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const card = await db.get(
      'SELECT * FROM cards WHERE id = $1 AND "userId" = $2',
      [id, userId]
    );

    if (!card) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    // FIX: Table quotes and Column quotes for PostgreSQL
    const transactions = await db.all(
      `SELECT * FROM "cardTransactions" 
       WHERE "cardId" = $1
       ORDER BY "createdAt" DESC
       LIMIT $2 OFFSET $3`,
      [id, parseInt(limit), parseInt(offset)]
    );

    const countData = await db.get(
      'SELECT COUNT(*) as total FROM "cardTransactions" WHERE "cardId" = $1',
      [id]
    );

    res.json({
      success: true,
      transactions,
      pagination: {
        total: parseInt(countData.total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get card transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve card transactions' });
  }
});

// 8. Admin: Get all cards
router.get('/admin/all', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    // FIX: Added double quotes to JOIN columns and CamelCase fields
    let query = `SELECT c.*, u."firstName", u."lastName", u.email, a."accountNumber"
                 FROM cards c
                 JOIN users u ON c."userId" = u.id
                 JOIN accounts a ON c."accountId" = a.id
                 WHERE 1=1`;
    let params = [];

    if (status) {
      query += ' AND c.status = $' + (params.length + 1);
      params.push(status);
    }

    query += ` ORDER BY c."createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const cards = await db.all(query, params);

    // Mask sensitive data
    cards.forEach(card => {
      card.cardNumber = maskCardNumber(card.cardNumber);
      delete card.cvv;
      delete card.pin;
    });

    res.json({ success: true, cards });

  } catch (error) {
    console.error('Get all cards error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve cards' });
  }
});

// 9. Admin: Update card status
router.put('/admin/:id/status', authenticate, authorizeAdmin, [
  body('status').isIn(['active', 'frozen', 'cancelled'])
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const card = await db.get('SELECT * FROM cards WHERE id = $1', [id]);
    if (!card) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    await db.run(
      'UPDATE cards SET status = $1 WHERE id = $2',
      [status, id]
    );

    // Notify user - Fixed quotes for "firstName"
    const user = await db.get('SELECT email, "firstName" FROM users WHERE id = $1', [card.userId]);
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

    res.json({ success: true, message: 'Card status updated successfully' });

  } catch (error) {
    console.error('Update card status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update card status' });
  }
});

module.exports = router;