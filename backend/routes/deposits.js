const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); // Points to your smart db.js
const { createTransaction } = require('./transactions');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// 1. Get all deposits for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const deposits = await db.all(`
      SELECT d.*, a."accountNumber" 
      FROM deposits d
      JOIN accounts a ON d."accountId" = a.id
      WHERE d."userId" = $1 
      ORDER BY d.date DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: { deposits }
    });

  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({ success: false, message: 'Error fetching deposits' });
  }
});

// 2. Card Deposit
router.post('/card', authenticate, [
  body('accountId').notEmpty(),
  body('amount').isFloat({ min: 10 }),
  body('cardNumber').notEmpty(),
  body('cardHolderName').notEmpty(),
  body('expiryDate').notEmpty(),
  body('cvv').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, amount, cardNumber, cardHolderName, expiryDate, cvv } = req.body;

    // Verify account ownership
    const account = await db.get(
      'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Create deposit record
    const depositId = uuidv4();
    await db.run(`
      INSERT INTO deposits (id, "userId", "accountId", "depositType", amount, status, "cardNumber", "cardHolderName", "expiryDate")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [depositId, req.user.id, accountId, 'card', amount, 'completed', cardNumber.slice(-4), cardHolderName, expiryDate]);

    // Create transaction (Fiat credit)
    await db.run(
        'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
        [amount, accountId]
    );

    const transId = uuidv4();
    await db.run(`
      INSERT INTO transactions (id, "accountId", "userId", type, amount, description, status, category)
      VALUES ($1, $2, $3, 'card_deposit', $4, $5, 'completed', 'Deposit')
    `, [transId, accountId, req.user.id, amount, `Card deposit from ${cardHolderName}`]);

    const deposit = await db.get('SELECT * FROM deposits WHERE id = $1', [depositId]);

    res.json({
      success: true,
      message: 'Card deposit processed successfully',
      data: { deposit }
    });

  } catch (error) {
    console.error('Card deposit error:', error);
    res.status(500).json({ success: false, message: 'Error processing card deposit' });
  }
});

// 3. Crypto Deposit
router.post('/crypto', authenticate, [
  body('accountId').notEmpty(),
  body('amount').isFloat({ min: 10 }),
  body('cryptoType').notEmpty(),
  body('cryptoAmount').isFloat({ min: 0.0001 })
], async (req, res) => {
  try {
    const { accountId, amount, cryptoType, cryptoAmount, walletAddress } = req.body;

    const account = await db.get('SELECT * FROM accounts WHERE id = $1 AND "userId" = $2', [accountId, req.user.id]);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const depositId = uuidv4();
    await db.run(`
      INSERT INTO deposits (id, "userId", "accountId", "depositType", amount, status, "cryptoType", "cryptoAmount", "walletAddress")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [depositId, req.user.id, accountId, 'crypto', amount, 'processing', cryptoType, cryptoAmount, walletAddress]);

    const deposit = await db.get('SELECT * FROM deposits WHERE id = $1', [depositId]);
    const generatedWalletAddress = `1${cryptoType}${Date.now().toString(36)}`;

    res.json({
      success: true,
      message: 'Crypto deposit initiated',
      data: { deposit, walletAddress: generatedWalletAddress }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error processing crypto deposit' });
  }
});

// 4. Check Deposit
router.post('/check', authenticate, [
  body('accountId').notEmpty(),
  body('amount').isFloat({ min: 1 }),
  body('checkNumber').notEmpty(),
  body('bankName').notEmpty()
], async (req, res) => {
  try {
    const { accountId, amount, checkNumber, bankName } = req.body;

    const account = await db.get('SELECT * FROM accounts WHERE id = $1 AND "userId" = $2', [accountId, req.user.id]);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const depositId = uuidv4();
    await db.run(`
      INSERT INTO deposits (id, "userId", "accountId", "depositType", amount, status, "checkNumber", "bankName")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [depositId, req.user.id, accountId, 'check', amount, 'pending', checkNumber, bankName]);

    const deposit = await db.get('SELECT * FROM deposits WHERE id = $1', [depositId]);

    res.json({
      success: true,
      message: 'Check deposit submitted for review',
      data: { deposit, estimatedClearance: '1-2 business days' }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error processing check deposit' });
  }
});

// 5. Admin: Get pending deposits
router.get('/admin/pending', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const deposits = await db.all(`
      SELECT d.*, u."firstName", u."lastName", u.email, a."accountNumber"
      FROM deposits d
      JOIN users u ON d."userId" = u.id
      JOIN accounts a ON d."accountId" = a.id
      WHERE d.status = 'pending' OR d.status = 'processing'
      ORDER BY d.date ASC
    `);

    res.json({ success: true, data: { deposits } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching pending deposits' });
  }
});

// 6. Admin: Approve deposit
router.post('/admin/:id/approve', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const deposit = await db.get('SELECT * FROM deposits WHERE id = $1', [req.params.id]);
    if (!deposit) return res.status(404).json({ success: false, message: 'Deposit not found' });

    await db.run('UPDATE deposits SET status = $1 WHERE id = $2', ['completed', req.params.id]);

    await db.run('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [deposit.amount, deposit.accountId]);

    const transId = uuidv4();
    await db.run(`
      INSERT INTO transactions (id, "accountId", "userId", type, amount, description, status, category)
      VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'Deposit')
    `, [transId, deposit.accountId, deposit.userId, `${deposit.depositType}_deposit`, deposit.amount, `${deposit.depositType.toUpperCase()} deposit approved`]);

    res.json({ success: true, message: 'Deposit approved and funds credited' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error approving deposit' });
  }
});

// 7. Admin: Reject deposit
router.post('/admin/:id/reject', authenticate, authorizeAdmin, [
  body('reason').notEmpty()
], async (req, res) => {
  try {
    const { reason } = req.body;
    const deposit = await db.get('SELECT * FROM deposits WHERE id = $1', [req.params.id]);
    if (!deposit) return res.status(404).json({ success: false, message: 'Deposit not found' });

    await db.run('UPDATE deposits SET status = $1 WHERE id = $2', ['rejected', req.params.id]);

    const user = await db.get('SELECT * FROM users WHERE id = $1', [deposit.userId]);
    await sendEmail({
      to: user.email,
      subject: 'Deposit Rejected - SecureBank',
      template: 'welcome', // Reusing template as per original code
      data: { firstName: user.firstName, reason }
    });

    res.json({ success: true, message: 'Deposit rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error rejecting deposit' });
  }
});

module.exports = router;