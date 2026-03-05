const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { dbAsync } = require('../database/db');

const router = express.Router();

// Bill providers (mock data - stays the same)
const billProviders = [
  { id: 'coned', name: 'Con Edison', type: 'electricity' },
  { id: 'nywater', name: 'New York Water', type: 'water' },
  { id: 'nationalgrid', name: 'National Grid', type: 'gas' },
  { id: 'verizon', name: 'Verizon Fios', type: 'internet' },
  { id: 'att', name: 'AT&T', type: 'phone' },
  { id: 'spectrum', name: 'Spectrum', type: 'cable' },
  { id: 'statefarm', name: 'State Farm', type: 'insurance' }
];

// 1. Get bill providers
router.get('/providers', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: { providers: billProviders }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching providers' });
  }
});

// 2. Get user's bill payments
router.get('/', authenticate, async (req, res) => {
  try {
    // Postgres Fix: Quotes around table name and userId column
    const bills = await dbAsync.all(`
      SELECT * FROM "billPayments" 
      WHERE "userId" = $1 
      ORDER BY "dueDate" ASC
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

// 3. Pay bill
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

    // Verify account ownership
    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (parseFloat(account.balance) < parseFloat(amount)) {
      return res.status(400).json({ success: false, message: 'Insufficient funds' });
    }

    const billId = uuidv4();
    const reference = 'BILL-' + Date.now();

    // Fix: Using quotes for "billPayments", "userId", etc. and CURRENT_TIMESTAMP
    await dbAsync.run(`
      INSERT INTO "billPayments" (id, "userId", "billType", provider, "accountNumber", amount, "dueDate", "paymentDate", status, reference)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 'paid', $8)
    `, [billId, req.user.id, billType, provider, accountNumber, amount, dueDate || null, reference]);

    // Deduct from account balance
    await dbAsync.run(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [amount, accountId]
    );

    // Log the transaction
    const transId = uuidv4();
    await dbAsync.run(`
      INSERT INTO transactions (id, "accountId", "userId", type, amount, description, status, category, reference)
      VALUES ($1, $2, $3, 'bill_payment', $4, $5, 'completed', 'Utilities', $6)
    `, [transId, accountId, req.user.id, -amount, `${provider} - ${billType}`, reference]);

    const bill = await dbAsync.get('SELECT * FROM "billPayments" WHERE id = $1', [billId]);

    res.json({
      success: true,
      message: 'Bill paid successfully',
      data: { bill }
    });

  } catch (error) {
    console.error('Pay bill error:', error);
    res.status(500).json({ success: false, message: 'Error paying bill: ' + error.message });
  }
});

// 4. Schedule bill payment
router.post('/schedule', authenticate, [
  body('accountId').notEmpty(),
  body('billType').notEmpty(),
  body('provider').notEmpty(),
  body('accountNumber').notEmpty(),
  body('amount').isFloat({ min: 1 }),
  body('paymentDate').notEmpty()
], async (req, res) => {
  try {
    const { accountId, billType, provider, accountNumber, amount, paymentDate } = req.body;
    const billId = uuidv4();
    const reference = 'BILL-SCH-' + Date.now();

    await dbAsync.run(`
      INSERT INTO "billPayments" (id, "userId", "billType", provider, "accountNumber", amount, "dueDate", status, reference)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
    `, [billId, req.user.id, billType, provider, accountNumber, amount, paymentDate, reference]);

    const bill = await dbAsync.get('SELECT * FROM "billPayments" WHERE id = $1', [billId]);

    res.json({
      success: true,
      message: 'Bill payment scheduled',
      data: { bill }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error scheduling bill payment' });
  }
});

module.exports = router;