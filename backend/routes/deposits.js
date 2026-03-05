const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync } = require('../database/db');
const { createTransaction } = require('./transactions');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// Get all deposits for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const deposits = await dbAsync.all(`
      SELECT d.*, a.accountNumber 
      FROM deposits d
      JOIN accounts a ON d.accountId = a.id
      WHERE d.userId = ? 
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

// Card Deposit
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

    // Verify account
    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Create deposit record
    const depositId = uuidv4();
    await dbAsync.run(`
      INSERT INTO deposits (id, userId, accountId, depositType, amount, status, cardNumber, cardHolderName, expiryDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [depositId, req.user.id, accountId, 'card', amount, 'completed', cardNumber.slice(-4), cardHolderName, expiryDate]);

    // Create transaction
    const transaction = await createTransaction({
      userId: req.user.id,
      accountId,
      type: 'card_deposit',
      amount: parseFloat(amount),
      description: `Card deposit from ${cardHolderName}`,
      category: 'Deposit'
    });

    const deposit = await dbAsync.get('SELECT * FROM deposits WHERE id = ?', [depositId]);

    res.json({
      success: true,
      message: 'Card deposit processed successfully',
      data: { deposit, transaction }
    });

  } catch (error) {
    console.error('Card deposit error:', error);
    res.status(500).json({ success: false, message: 'Error processing card deposit' });
  }
});

// Crypto Deposit
router.post('/crypto', authenticate, [
  body('accountId').notEmpty(),
  body('amount').isFloat({ min: 10 }),
  body('cryptoType').notEmpty(),
  body('cryptoAmount').isFloat({ min: 0.0001 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, amount, cryptoType, cryptoAmount, walletAddress } = req.body;

    // Verify account
    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Create deposit record
    const depositId = uuidv4();
    await dbAsync.run(`
      INSERT INTO deposits (id, userId, accountId, depositType, amount, status, cryptoType, cryptoAmount, walletAddress)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [depositId, req.user.id, accountId, 'crypto', amount, 'processing', cryptoType, cryptoAmount, walletAddress]);

    const deposit = await dbAsync.get('SELECT * FROM deposits WHERE id = ?', [depositId]);

    // Generate wallet address for user to send crypto
    const generatedWalletAddress = `1${cryptoType}${Date.now().toString(36)}`;

    res.json({
      success: true,
      message: 'Crypto deposit initiated',
      data: { 
        deposit,
        walletAddress: generatedWalletAddress,
        instructions: `Please send ${cryptoAmount} ${cryptoType} to the wallet address above. Funds will be credited after 3-6 network confirmations.`
      }
    });

  } catch (error) {
    console.error('Crypto deposit error:', error);
    res.status(500).json({ success: false, message: 'Error processing crypto deposit' });
  }
});

// Check Deposit
router.post('/check', authenticate, [
  body('accountId').notEmpty(),
  body('amount').isFloat({ min: 1 }),
  body('checkNumber').notEmpty(),
  body('bankName').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, amount, checkNumber, bankName } = req.body;

    // Verify account
    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Create deposit record
    const depositId = uuidv4();
    await dbAsync.run(`
      INSERT INTO deposits (id, userId, accountId, depositType, amount, status, checkNumber, bankName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [depositId, req.user.id, accountId, 'check', amount, 'pending', checkNumber, bankName]);

    const deposit = await dbAsync.get('SELECT * FROM deposits WHERE id = ?', [depositId]);

    res.json({
      success: true,
      message: 'Check deposit submitted for review',
      data: { 
        deposit,
        estimatedClearance: '1-2 business days'
      }
    });

  } catch (error) {
    console.error('Check deposit error:', error);
    res.status(500).json({ success: false, message: 'Error processing check deposit' });
  }
});

// Admin: Get pending deposits
router.get('/admin/pending', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const deposits = await dbAsync.all(`
      SELECT d.*, u.firstName, u.lastName, u.email, a.accountNumber
      FROM deposits d
      JOIN users u ON d.userId = u.id
      JOIN accounts a ON d.accountId = a.id
      WHERE d.status = 'pending' OR d.status = 'processing'
      ORDER BY d.date ASC
    `);

    res.json({
      success: true,
      data: { deposits }
    });

  } catch (error) {
    console.error('Get pending deposits error:', error);
    res.status(500).json({ success: false, message: 'Error fetching pending deposits' });
  }
});

// Admin: Approve deposit
router.post('/admin/:id/approve', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const deposit = await dbAsync.get('SELECT * FROM deposits WHERE id = ?', [req.params.id]);

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    // Update deposit status
    await dbAsync.run(
      'UPDATE deposits SET status = ? WHERE id = ?',
      ['completed', req.params.id]
    );

    // Create transaction
    await createTransaction({
      userId: deposit.userId,
      accountId: deposit.accountId,
      type: `${deposit.depositType}_deposit`,
      amount: deposit.amount,
      description: `${deposit.depositType.charAt(0).toUpperCase() + deposit.depositType.slice(1)} deposit approved`,
      category: 'Deposit'
    });

    res.json({
      success: true,
      message: 'Deposit approved and funds credited'
    });

  } catch (error) {
    console.error('Approve deposit error:', error);
    res.status(500).json({ success: false, message: 'Error approving deposit' });
  }
});

// Admin: Reject deposit
router.post('/admin/:id/reject', authenticate, authorizeAdmin, [
  body('reason').notEmpty()
], async (req, res) => {
  try {
    const { reason } = req.body;

    const deposit = await dbAsync.get('SELECT * FROM deposits WHERE id = ?', [req.params.id]);

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    await dbAsync.run(
      'UPDATE deposits SET status = ? WHERE id = ?',
      ['rejected', req.params.id]
    );

    // Notify user
    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [deposit.userId]);
    await sendEmail({
      to: user.email,
      subject: 'Deposit Rejected - SecureBank',
      template: 'welcome',
      userId: user.id,
      data: {
        firstName: user.firstName,
        reason
      }
    });

    res.json({
      success: true,
      message: 'Deposit rejected'
    });

  } catch (error) {
    console.error('Reject deposit error:', error);
    res.status(500).json({ success: false, message: 'Error rejecting deposit' });
  }
});

module.exports = router;
