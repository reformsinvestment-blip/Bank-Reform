const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); // Points to your dbAsync helper
const { sendTransactionReceipt } = require('../services/emailService');

const router = express.Router();

// 1. Get all transactions for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      accountId, type, status, startDate, endDate, limit = 50, offset = 0 
    } = req.query;

    // FIX: Using quotes for "accountId", "accountNumber", "userId" and $1
    let sql = `
      SELECT t.*, a."accountNumber" 
      FROM transactions t
      JOIN accounts a ON t."accountId" = a.id
      WHERE t."userId" = $1
    `;
    const params = [req.user.id];

    if (accountId) {
      sql += ` AND t."accountId" = $${params.length + 1}`;
      params.push(accountId);
    }
    if (type) {
      sql += ` AND t.type = $${params.length + 1}`;
      params.push(type);
    }
    if (status) {
      sql += ` AND t.status = $${params.length + 1}`;
      params.push(status);
    }
    if (startDate) {
      sql += ` AND t.date >= $${params.length + 1}`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND t.date <= $${params.length + 1}`;
      params.push(endDate);
    }

    sql += ` ORDER BY t.date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const transactions = await db.all(sql, params);

    // Get total count for pagination - FIX: Quoted column
    let countSql = 'SELECT COUNT(*) as total FROM transactions WHERE "userId" = $1';
    const countParams = [req.user.id];
    
    if (accountId) {
      countSql += ' AND "accountId" = $2';
      countParams.push(accountId);
    }

    const countData = await db.get(countSql, countParams);
    const total = parseInt(countData.total || 0);

    res.json({
      success: true,
      data: { 
        transactions,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + transactions.length < total
        }
      }
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching transactions' });
  }
});

// 2. Get single transaction
router.get('/:id', authenticate, async (req, res) => {
  try {
    // FIX: Using quotes and $ placeholders
    const transaction = await db.get(`
      SELECT t.*, a."accountNumber" 
      FROM transactions t
      JOIN accounts a ON t."accountId" = a.id
      WHERE t.id = $1 AND t."userId" = $2
    `, [req.params.id, req.user.id]);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json({ success: true, data: { transaction } });

  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ success: false, message: 'Error fetching transaction' });
  }
});

// 3. Create transaction (Internal Helper - Preserved Logic)
const createTransaction = async ({
  userId, accountId, type, amount, currency = 'USD', description,
  recipientName, recipientAccount, recipientBank, swiftCode, iban,
  category, fee = 0, codes = {}
}) => {
  const transactionId = uuidv4();
  const reference = type.toUpperCase().substring(0, 3) + Date.now();

  // FIX: Full Quoted Insert syntax for Postgres
  await db.run(`
    INSERT INTO transactions (
      id, "accountId", "userId", type, amount, currency, description,
      "recipientName", "recipientAccount", "recipientBank", "swiftCode", iban,
      status, category, reference, fee, "cotCode", "taxCode", "imfCode"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'completed', $13, $14, $15, $16, $17, $18)
  `, [
    transactionId, accountId, userId, type, amount, currency, description,
    recipientName || null, recipientAccount || null, recipientBank || null,
    swiftCode || null, iban || null, category || 'other',
    reference, fee, codes.cotCode || null, codes.taxCode || null, codes.imfCode || null
  ]);

  // Update account balance - FIX: Quoted column
  await db.run('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, accountId]);

  const transaction = await db.get('SELECT * FROM transactions WHERE id = $1', [transactionId]);

  // Send receipt email (logic preserved)
  try {
    await sendTransactionReceipt(userId, transaction);
  } catch (e) {
    console.error("Email receipt failed:", e.message);
  }

  return transaction;
};

// 4. Get transaction categories summary
router.get('/stats/categories', authenticate, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    // FIX: Using Postgres CURRENT_DATE logic
    const categories = await db.all(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses
      FROM transactions 
      WHERE "userId" = $1 
      AND date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      AND category IS NOT NULL
      GROUP BY category
      ORDER BY expenses DESC
    `, [req.user.id, period]);

    res.json({ success: true, data: { categories } });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching categories' });
  }
});

// 5. Get monthly summary
router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const { months = 6 } = req.query;

    // FIX: PostgreSQL version of monthly grouping using TO_CHAR and INTERVAL
    const monthlyData = await db.all(`
      SELECT 
        TO_CHAR(date, 'YYYY-MM') as month,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses,
        COUNT(*) as "transactionCount"
      FROM transactions 
      WHERE "userId" = $1 AND date >= CURRENT_DATE - ($2 || ' months')::INTERVAL
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month DESC
    `, [req.user.id, months]);

    res.json({
      success: true,
      data: { monthly: monthlyData }
    });

  } catch (error) {
    console.error('Get monthly stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching statistics' });
  }
});

module.exports = router;
module.exports.createTransaction = createTransaction;