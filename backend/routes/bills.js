const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { dbAsync } = require('../database/db');
const { createTransaction } = require('./transactions');

const router = express.Router();

// Bill providers (mock data - in production, this would come from a database)
const billProviders = [
  { id: 'coned', name: 'Con Edison', type: 'electricity' },
  { id: 'nywater', name: 'New York Water', type: 'water' },
  { id: 'nationalgrid', name: 'National Grid', type: 'gas' },
  { id: 'verizon', name: 'Verizon Fios', type: 'internet' },
  { id: 'att', name: 'AT&T', type: 'phone' },
  { id: 'spectrum', name: 'Spectrum', type: 'cable' },
  { id: 'statefarm', name: 'State Farm', type: 'insurance' }
];

// Get bill providers
router.get('/providers', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: { providers: billProviders }
    });

  } catch (error) {
    console.error('Get providers error:', error);
    res.status(500).json({ success: false, message: 'Error fetching providers' });
  }
});

// Get user's bill payments
router.get('/', authenticate, async (req, res) => {
  try {
    const bills = await dbAsync.all(`
      SELECT * FROM billPayments 
      WHERE userId = ? 
      ORDER BY dueDate ASC
    `, [req.user.id]);

    res.json({
      success: true,
      data: { bills }
    });

  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ success: false, message: 'Error fetching bills' });
  }
});

// Pay bill
router.post('/pay', authenticate, [
  body('accountId').notEmpty(),
  body('billType').notEmpty(),
  body('provider').notEmpty(),
  body('accountNumber').notEmpty(),
  body('amount').isFloat({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, billType, provider, accountNumber, amount, dueDate } = req.body;

    // Verify account
    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (account.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient funds' });
    }

    // Create bill payment record
    const billId = uuidv4();
    const reference = 'BILL-' + Date.now();

    await dbAsync.run(`
      INSERT INTO billPayments (id, userId, billType, provider, accountNumber, amount, dueDate, paymentDate, status, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [billId, req.user.id, billType, provider, accountNumber, amount, dueDate || null, new Date().toISOString(), 'paid', reference]);

    // Create transaction
    const transaction = await createTransaction({
      userId: req.user.id,
      accountId,
      type: 'bill_payment',
      amount: -parseFloat(amount),
      description: `${provider} - ${billType}`,
      category: 'Utilities'
    });

    const bill = await dbAsync.get('SELECT * FROM billPayments WHERE id = ?', [billId]);

    res.json({
      success: true,
      message: 'Bill paid successfully',
      data: { bill, transaction }
    });

  } catch (error) {
    console.error('Pay bill error:', error);
    res.status(500).json({ success: false, message: 'Error paying bill' });
  }
});

// Schedule bill payment
router.post('/schedule', authenticate, [
  body('accountId').notEmpty(),
  body('billType').notEmpty(),
  body('provider').notEmpty(),
  body('accountNumber').notEmpty(),
  body('amount').isFloat({ min: 1 }),
  body('paymentDate').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, billType, provider, accountNumber, amount, paymentDate } = req.body;

    // Create scheduled bill payment
    const billId = uuidv4();
    const reference = 'BILL-SCH-' + Date.now();

    await dbAsync.run(`
      INSERT INTO billPayments (id, userId, billType, provider, accountNumber, amount, dueDate, status, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [billId, req.user.id, billType, provider, accountNumber, amount, paymentDate, 'pending', reference]);

    const bill = await dbAsync.get('SELECT * FROM billPayments WHERE id = ?', [billId]);

    res.json({
      success: true,
      message: 'Bill payment scheduled',
      data: { bill }
    });

  } catch (error) {
    console.error('Schedule bill error:', error);
    res.status(500).json({ success: false, message: 'Error scheduling bill payment' });
  }
});

module.exports = router;
