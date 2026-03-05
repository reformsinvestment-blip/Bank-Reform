const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { dbAsync } = require('../database/db');
const { sendTransactionReceipt } = require('../services/emailService');

const router = express.Router();

// Get all transactions for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      accountId, 
      type, 
      status, 
      startDate, 
      endDate, 
      limit = 50, 
      offset = 0 
    } = req.query;

    let sql = `
      SELECT t.*, a.accountNumber 
      FROM transactions t
      JOIN accounts a ON t.accountId = a.id
      WHERE t.userId = ?
    `;
    const params = [req.user.id];

    if (accountId) {
      sql += ' AND t.accountId = ?';
      params.push(accountId);
    }

    if (type) {
      sql += ' AND t.type = ?';
      params.push(type);
    }

    if (status) {
      sql += ' AND t.status = ?';
      params.push(status);
    }

    if (startDate) {
      sql += ' AND t.date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND t.date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY t.date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const transactions = await dbAsync.all(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM transactions WHERE userId = ?';
    const countParams = [req.user.id];
    
    if (accountId) {
      countSql += ' AND accountId = ?';
      countParams.push(accountId);
    }

    const { total } = await dbAsync.get(countSql, countParams);

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
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions'
    });
  }
});

// Get single transaction
router.get('/:id', authenticate, async (req, res) => {
  try {
    const transaction = await dbAsync.get(`
      SELECT t.*, a.accountNumber 
      FROM transactions t
      JOIN accounts a ON t.accountId = a.id
      WHERE t.id = ? AND t.userId = ?
    `, [req.params.id, req.user.id]);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: { transaction }
    });

  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction'
    });
  }
});

// Create transaction (internal use)
const createTransaction = async ({
  userId,
  accountId,
  type,
  amount,
  currency = 'USD',
  description,
  recipientName,
  recipientAccount,
  recipientBank,
  swiftCode,
  iban,
  category,
  fee = 0,
  codes = {}
}) => {
  const transactionId = uuidv4();
  const reference = type.toUpperCase().substring(0, 3) + Date.now();

  await dbAsync.run(`
    INSERT INTO transactions (
      id, accountId, userId, type, amount, currency, description,
      recipientName, recipientAccount, recipientBank, swiftCode, iban,
      status, category, reference, fee, cotCode, taxCode, imfCode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    transactionId, accountId, userId, type, amount, currency, description,
    recipientName || null, recipientAccount || null, recipientBank || null,
    swiftCode || null, iban || null, 'completed', category || 'other',
    reference, fee, codes.cotCode || null, codes.taxCode || null, codes.imfCode || null
  ]);

  // Update account balance
  await dbAsync.run(`
    UPDATE accounts 
    SET balance = balance + ? 
    WHERE id = ?
  `, [amount, accountId]);

  const transaction = await dbAsync.get('SELECT * FROM transactions WHERE id = ?', [transactionId]);

  // Send receipt email
  await sendTransactionReceipt(userId, transaction);

  return transaction;
};

// Get transaction categories summary
router.get('/stats/categories', authenticate, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const categories = await dbAsync.all(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses
      FROM transactions 
      WHERE userId = ? AND date >= ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY expenses DESC
    `, [req.user.id, startDate.toISOString()]);

    res.json({
      success: true,
      data: { categories }
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories'
    });
  }
});

// Get monthly summary
router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const monthlyData = await dbAsync.all(`
      SELECT 
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses,
        COUNT(*) as transactionCount
      FROM transactions 
      WHERE userId = ? AND date >= date('now', '-${months} months')
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: { monthly: monthlyData }
    });

  } catch (error) {
    console.error('Get monthly stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching monthly statistics'
    });
  }
});

module.exports = router;
module.exports.createTransaction = createTransaction;
