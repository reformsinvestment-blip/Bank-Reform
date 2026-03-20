const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { pool, dbAsync } = require('../database/db'); // Added 'pool' for raw transactions
const { sendEmail } = require('../services/emailService');

const router = express.Router();

const sanitizeAmount = v => parseFloat(String(v).replace(/,/g, '').trim());

// ---------------------------------------------------------
// 1. LOCAL TRANSFER (Secured with Row Locking)
// ---------------------------------------------------------
router.post('/local', authenticate, [
    body('fromAccountId').notEmpty(),
    body('toAccountNumber').notEmpty(),
    body('amount').customSanitizer(sanitizeAmount).isFloat({ min: 1 })
], async (req, res) => {
    const client = await pool.connect(); // Get a dedicated client for the transaction
    try {
        const { fromAccountId, toAccountNumber, recipientName, amount, description } = req.body;
        const parsedAmount = sanitizeAmount(amount);

        await client.query('BEGIN'); // ─── START TRANSACTION ───

        // SECURITY: Lock the sender's row. No other process can read/write until we COMMIT.
        const fromAccRes = await client.query(
            'SELECT id, balance FROM accounts WHERE id = $1 AND "userId" = $2 FOR UPDATE',
            [fromAccountId, req.user.id]
        );
        const fromAccount = fromAccRes.rows[0];

        if (!fromAccount) throw new Error('Source account not found or unauthorized');
        
        if (Number(fromAccount.balance) < parsedAmount) {
            throw new Error(`Insufficient funds. Available: $${Number(fromAccount.balance).toFixed(2)}`);
        }

        // 1. Deduct from Sender
        await client.query(
            'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
            [parsedAmount, fromAccountId]
        );

        // 2. Check if Recipient is internal and add money
        const toAccRes = await client.query(
            'SELECT id, "userId" FROM accounts WHERE "accountNumber" = $1 FOR UPDATE',
            [toAccountNumber]
        );
        const toAccount = toAccRes.rows[0];

        if (toAccount) {
            await client.query(
                'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
                [parsedAmount, toAccount.id]
            );
        }

        // 3. Create Transaction Records (Inside the same transaction block)
        const reference = 'TRF-' + Date.now();
        await client.query(`
            INSERT INTO transactions (id, "accountId", "userId", type, amount, description, "recipientName", "recipientAccount", status, reference, category)
            VALUES ($1, $2, $3, 'local_transfer', $4, $5, $6, $7, 'completed', $8, 'Transfer')
        `, [uuidv4(), fromAccountId, req.user.id, -parsedAmount, description || `Transfer to ${recipientName}`, recipientName, toAccountNumber, reference]);

        if (toAccount) {
            await client.query(`
                INSERT INTO transactions (id, "accountId", "userId", type, amount, description, "recipientName", status, reference, category)
                VALUES ($1, $2, $3, 'local_transfer', $4, $5, $6, 'completed', $7, 'Transfer')
            `, [uuidv4(), toAccount.id, toAccount.userId, parsedAmount, `Transfer from ${req.user.firstName}`, `${req.user.firstName} ${req.user.lastName}`, reference]);
        }

        await client.query('COMMIT'); // ─── SAVE EVERYTHING PERMANENTLY ───
        
        res.json({ success: true, message: 'Transfer completed successfully' });

    } catch (err) {
        await client.query('ROLLBACK'); // ─── UNDO EVERYTHING ON ERROR ───
        console.error('Local Transfer Security Block:', err.message);
        res.status(400).json({ success: false, message: err.message });
    } finally {
        client.release(); // Return connection to the pool
    }
});

// ---------------------------------------------------------
// 2. INTERNATIONAL / WIRE TRANSFER (Secured with Fees)
// ---------------------------------------------------------
router.post(['/international', '/wire'], authenticate, [
    body('fromAccountId').notEmpty(),
    body('amount').customSanitizer(sanitizeAmount).isFloat({ min: 1 })
], async (req, res) => {
    const client = await pool.connect();
    try {
        const { fromAccountId, amount, recipientName, recipientBank, swiftCode, cotCode, taxCode, imfCode } = req.body;
        const parsedAmount = sanitizeAmount(amount);
        const fee = 45.00;
        const totalDebit = parsedAmount + fee;
        const isWire = req.path.includes('wire');

        await client.query('BEGIN');

        // SECURITY: Lock row
        const accRes = await client.query(
            'SELECT balance FROM accounts WHERE id = $1 AND "userId" = $2 FOR UPDATE',
            [fromAccountId, req.user.id]
        );
        const account = accRes.rows[0];

        if (!account || Number(account.balance) < totalDebit) {
            throw new Error('Insufficient funds to cover transfer + $45 processing fee');
        }

        // Deduct Total
        await client.query(
            'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
            [totalDebit, fromAccountId]
        );

        // Record Transaction
        await client.query(`
            INSERT INTO transactions (id, "accountId", "userId", type, amount, fee, description, status, "cotCode", "taxCode", "imfCode")
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10)
        `, [
            uuidv4(), fromAccountId, req.user.id, 
            isWire ? 'wire_transfer' : 'international_transfer', 
            -totalDebit, fee, `Transfer to ${recipientName} (${recipientBank})`,
            cotCode || null, taxCode || null, imfCode || null
        ]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Transfer initiated successfully' });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});
// 3. Get all saved beneficiaries for current user
router.get('/beneficiaries', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // FIX: Using quotes for "userId" column
    const beneficiaries = await dbAsync.all(
      'SELECT * FROM beneficiaries WHERE "userId" = ? ORDER BY name ASC',
      [userId]
    );

    res.json({
      success: true,
      data: { beneficiaries }
    });
  } catch (error) {
    console.error('Get beneficiaries error:', error);
    res.status(500).json({ success: false, message: 'Failed to load beneficiaries' });
  }
});

// 4. Save a new beneficiary
router.post('/beneficiaries', authenticate, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('accountNumber').notEmpty().withMessage('Account number is required'),
  body('bankName').notEmpty().withMessage('Bank name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, accountNumber, bankName, swiftCode, iban, nickname } = req.body;
    const userId = req.user.id;

    const beneficiaryId = uuidv4();

    await dbAsync.run(`
      INSERT INTO beneficiaries (id, "userId", name, "accountNumber", "bankName", "swiftCode", iban, nickname)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [beneficiaryId, userId, name, accountNumber, bankName, swiftCode || null, iban || null, nickname || null]);

    res.status(201).json({
      success: true,
      message: 'Beneficiary saved successfully',
      data: { id: beneficiaryId }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save beneficiary' });
  }
});

// 5. Delete a beneficiary
router.delete('/beneficiaries/:id', authenticate, async (req, res) => {
  try {
    await dbAsync.run(
      'DELETE FROM beneficiaries WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Beneficiary removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

module.exports = router;