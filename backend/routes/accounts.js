const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { dbAsync } = require('../database/db');

const router = express.Router();

// Get all accounts for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const accounts = await dbAsync.all(`
      SELECT * FROM accounts 
      WHERE userId = ? 
      ORDER BY createdAt DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: { accounts }
    });

  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching accounts'
    });
  }
});

// Get single account
router.get('/:id', authenticate, async (req, res) => {
  try {
    const account = await dbAsync.get(`
      SELECT * FROM accounts 
      WHERE id = ? AND userId = ?
    `, [req.params.id, req.user.id]);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Get recent transactions for this account
    const transactions = await dbAsync.all(`
      SELECT * FROM transactions 
      WHERE accountId = ? 
      ORDER BY date DESC 
      LIMIT 10
    `, [req.params.id]);

    res.json({
      success: true,
      data: { account, transactions }
    });

  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching account'
    });
  }
});

// Create new account
router.post('/', authenticate, async (req, res) => {
  try {
    const { accountType, currency = 'USD' } = req.body;

    const validTypes = ['checking', 'savings', 'investment', 'crypto'];
    if (!validTypes.includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account type'
      });
    }

    const accountId = uuidv4();
    const accountNumber = accountType.substring(0, 3).toUpperCase() + Date.now().toString().slice(-8);

    let interestRate = null;
    if (accountType === 'savings') interestRate = 3.5;

    await dbAsync.run(`
      INSERT INTO accounts (id, userId, accountNumber, accountType, balance, currency, interestRate, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [accountId, req.user.id, accountNumber, accountType, 0, currency, interestRate, 'active']);

    const account = await dbAsync.get('SELECT * FROM accounts WHERE id = ?', [accountId]);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { account }
    });

  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating account'
    });
  }
});

// Get account balance
router.get('/:id/balance', authenticate, async (req, res) => {
  try {
    const account = await dbAsync.get(`
      SELECT id, accountNumber, balance, currency, accountType 
      FROM accounts 
      WHERE id = ? AND userId = ?
    `, [req.params.id, req.user.id]);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    res.json({
      success: true,
      data: { account }
    });

  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching balance'
    });
  }
});

// Get account statistics
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    const account = await dbAsync.get(`
      SELECT * FROM accounts 
      WHERE id = ? AND userId = ?
    `, [req.params.id, req.user.id]);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get income and expenses
    const stats = await dbAsync.get(`
      SELECT 
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as totalIncome,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as totalExpenses,
        COUNT(*) as transactionCount
      FROM transactions 
      WHERE accountId = ? AND date >= ?
    `, [req.params.id, startDate.toISOString()]);

    // Get transactions by category
    const categories = await dbAsync.all(`
      SELECT category, SUM(ABS(amount)) as total
      FROM transactions 
      WHERE accountId = ? AND date >= ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY total DESC
    `, [req.params.id, startDate.toISOString()]);

    res.json({
      success: true,
      data: {
        account,
        period: `${period} days`,
        stats: {
          totalIncome: stats.totalIncome || 0,
          totalExpenses: stats.totalExpenses || 0,
          transactionCount: stats.transactionCount || 0,
          netChange: (stats.totalIncome || 0) - (stats.totalExpenses || 0)
        },
        categories
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics'
    });
  }
});

module.exports = router;
