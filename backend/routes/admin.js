const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync } = require('../database/db');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// Get admin dashboard stats
router.get('/stats', authenticate, authorizeAdmin, async (req, res) => {
  try {
    // Get user stats
    const userStats = await dbAsync.get(`
      SELECT 
        COUNT(*) as totalUsers,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN date(createdAt) = date('now') THEN 1 ELSE 0 END) as newUsersToday
      FROM users
      WHERE role = 'user'
    `);

    // Get account stats
    const accountStats = await dbAsync.get(`
      SELECT COUNT(*) as totalAccounts, SUM(balance) as totalBalance
      FROM accounts
    `);

    // Get transaction stats
    const transactionStats = await dbAsync.get(`
      SELECT 
        COUNT(*) as totalTransactions,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as totalDeposits,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as totalWithdrawals
      FROM transactions
      WHERE date(date) = date('now')
    `);

    // Get pending items
    const pendingLoans = await dbAsync.get("SELECT COUNT(*) as count FROM loans WHERE status = 'pending'");
    const pendingDeposits = await dbAsync.get("SELECT COUNT(*) as count FROM deposits WHERE status = 'pending'");

    res.json({
      success: true,
      data: {
        users: userStats,
        accounts: accountStats,
        transactions: transactionStats,
        pending: {
          loans: pendingLoans.count,
          deposits: pendingDeposits.count
        }
      }
    });

  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching stats' });
  }
});

// Get all users
router.get('/users', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT id, firstName, lastName, email, phone, role, isActive, isVerified, createdAt, lastLogin
      FROM users
      WHERE role = 'user'
    `;
    const params = [];

    if (search) {
      sql += ` AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status !== undefined) {
      sql += ` AND isActive = ?`;
      params.push(status === 'active' ? 1 : 0);
    }

    sql += ` ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const users = await dbAsync.all(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) as total FROM users WHERE role = 'user'`;
    const countParams = [];
    
    if (search) {
      countSql += ` AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const { total } = await dbAsync.get(countSql, countParams);

    res.json({
      success: true,
      data: { 
        users,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Error fetching users' });
  }
});

// Get single user details
router.get('/users/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const user = await dbAsync.get(`
      SELECT id, firstName, lastName, email, phone, address, city, country, 
             postalCode, dateOfBirth, avatar, role, isActive, isVerified, 
             createdAt, lastLogin, accountId
      FROM users WHERE id = ?
    `, [req.params.id]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get user's accounts
    const accounts = await dbAsync.all(
      'SELECT * FROM accounts WHERE userId = ?',
      [req.params.id]
    );

    // Get user's transactions
    const transactions = await dbAsync.all(`
      SELECT * FROM transactions 
      WHERE userId = ? 
      ORDER BY date DESC 
      LIMIT 10
    `, [req.params.id]);

    // Get user's loans
    const loans = await dbAsync.all(
      'SELECT * FROM loans WHERE userId = ? ORDER BY appliedDate DESC',
      [req.params.id]
    );

    res.json({
      success: true,
      data: { user, accounts, transactions, loans }
    });

  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ success: false, message: 'Error fetching user details' });
  }
});

// Update user
router.put('/users/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, isActive } = req.body;

    await dbAsync.run(`
      UPDATE users 
      SET firstName = COALESCE(?, firstName),
          lastName = COALESCE(?, lastName),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          isActive = COALESCE(?, isActive),
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [firstName, lastName, email, phone, isActive !== undefined ? (isActive ? 1 : 0) : null, req.params.id]);

    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [req.params.id]);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Error updating user' });
  }
});

// Fund user account (admin only)
router.post('/fund-account', authenticate, authorizeAdmin, [
  body('accountId').notEmpty(),
  body('amount').isFloat({ min: 1 }),
  body('description').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, amount, description } = req.body;

    // Get account
    const account = await dbAsync.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Update balance
    await dbAsync.run(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      [amount, accountId]
    );

    // Create transaction record
    const transactionId = uuidv4();
    await dbAsync.run(`
      INSERT INTO transactions (id, accountId, userId, type, amount, currency, description, status, category, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      transactionId, accountId, account.userId, 'deposit', amount, 
      account.currency, description || 'Admin account funding', 
      'completed', 'Deposit', 'ADMIN-' + Date.now()
    ]);

    // Log admin action
    await dbAsync.run(`
      INSERT INTO adminActions (id, adminId, actionType, targetUserId, details)
      VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), req.user.id, 'fund_account', account.userId, `Funded $${amount}`]);

    // Notify user
    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [account.userId]);
    await sendEmail({
      to: user.email,
      subject: 'Account Credited - SecureBank',
      template: 'welcome',
      userId: user.id,
      data: {
        firstName: user.firstName,
        amount: `$${amount}`,
        description: description || 'Account funding'
      }
    });

    const updatedAccount = await dbAsync.get('SELECT * FROM accounts WHERE id = ?', [accountId]);

    res.json({
      success: true,
      message: 'Account funded successfully',
      data: { account: updatedAccount }
    });

  } catch (error) {
    console.error('Fund account error:', error);
    res.status(500).json({ success: false, message: 'Error funding account' });
  }
});

// Change user password (admin only)
router.post('/users/:id/change-password', authenticate, authorizeAdmin, [
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { newPassword } = req.body;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await dbAsync.run(
      'UPDATE users SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, req.params.id]
    );

    // Log admin action
    await dbAsync.run(`
      INSERT INTO adminActions (id, adminId, actionType, targetUserId, details)
      VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), req.user.id, 'change_password', req.params.id, 'Password changed by admin']);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Error changing password' });
  }
});

// Change user PIN (admin only)
router.post('/users/:id/change-pin', authenticate, authorizeAdmin, [
  body('newPin').isLength({ min: 4, max: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { newPin } = req.body;

    await dbAsync.run(
      'UPDATE users SET pin = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [newPin, req.params.id]
    );

    // Log admin action
    await dbAsync.run(`
      INSERT INTO adminActions (id, adminId, actionType, targetUserId, details)
      VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), req.user.id, 'change_pin', req.params.id, 'PIN changed by admin']);

    res.json({
      success: true,
      message: 'PIN changed successfully'
    });

  } catch (error) {
    console.error('Change PIN error:', error);
    res.status(500).json({ success: false, message: 'Error changing PIN' });
  }
});

// Change account number (admin only)
router.post('/accounts/:id/change-number', authenticate, authorizeAdmin, [
  body('newAccountNumber').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { newAccountNumber } = req.body;

    // Check if account number already exists
    const existing = await dbAsync.get(
      'SELECT * FROM accounts WHERE accountNumber = ?',
      [newAccountNumber]
    );

    if (existing) {
      return res.status(400).json({ success: false, message: 'Account number already exists' });
    }

    const account = await dbAsync.get('SELECT * FROM accounts WHERE id = ?', [req.params.id]);

    await dbAsync.run(
      'UPDATE accounts SET accountNumber = ? WHERE id = ?',
      [newAccountNumber, req.params.id]
    );

    // Log admin action
    await dbAsync.run(`
      INSERT INTO adminActions (id, adminId, actionType, targetUserId, details)
      VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), req.user.id, 'change_account_id', account.userId, `Account number changed to ${newAccountNumber}`]);

    res.json({
      success: true,
      message: 'Account number changed successfully'
    });

  } catch (error) {
    console.error('Change account number error:', error);
    res.status(500).json({ success: false, message: 'Error changing account number' });
  }
});

// Get system activities
router.get('/activities', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const activities = await dbAsync.all(`
      SELECT a.*, u.firstName, u.lastName
      FROM adminActions a
      JOIN users u ON a.adminId = u.id
      ORDER BY a.performedAt DESC
      LIMIT ?
    `, [parseInt(limit)]);

    res.json({
      success: true,
      data: { activities }
    });

  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching activities' });
  }
});

module.exports = router;
