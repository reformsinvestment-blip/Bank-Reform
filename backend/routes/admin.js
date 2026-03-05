const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync } = require('../database/db');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// 1. Get admin dashboard stats
router.get('/stats', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const userStats = await dbAsync.get(`
      SELECT 
        COUNT(*) as "totalUsers",
        SUM(CASE WHEN "isActive" = true THEN 1 ELSE 0 END) as "activeUsers",
        SUM(CASE WHEN "createdAt"::date = CURRENT_DATE THEN 1 ELSE 0 END) as "newUsersToday"
      FROM users
      WHERE role = 'user'
    `);

    const accountStats = await dbAsync.get(`
      SELECT COUNT(*) as "totalAccounts", SUM(balance) as "totalBalance"
      FROM accounts
    `);

    const transactionStats = await dbAsync.get(`
      SELECT 
        COUNT(*) as "totalTransactions",
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as "totalDeposits",
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as "totalWithdrawals"
      FROM transactions
      WHERE date::date = CURRENT_DATE
    `);

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
    res.status(500).json({ success: false, message: 'Error fetching stats: ' + error.message });
  }
});

// 2. Get all users
router.get('/users', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT id, "firstName", "lastName", email, phone, role, "isActive", "isVerified", "createdAt", "lastLogin"
      FROM users
      WHERE role = 'user'
    `;
    const params = [];

    if (search) {
      sql += ` AND ("firstName" ILIKE $${params.length + 1} OR "lastName" ILIKE $${params.length + 2} OR email ILIKE $${params.length + 3})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status !== undefined) {
      sql += ` AND "isActive" = $${params.length + 1}`;
      params.push(status === 'active');
    }

    sql += ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const users = await dbAsync.all(sql, params);

    let countSql = `SELECT COUNT(*) as total FROM users WHERE role = 'user'`;
    const countParams = [];
    if (search) {
      countSql += ` AND ("firstName" ILIKE $1 OR "lastName" ILIKE $2 OR email ILIKE $3)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const { total } = await dbAsync.get(countSql, countParams);

    res.json({
      success: true,
      data: { 
        users,
        pagination: { total: parseInt(total), page: parseInt(page), pages: Math.ceil(total / limit) }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Error fetching users' });
  }
});

// 3. Get single user details
router.get('/users/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const user = await dbAsync.get(`
      SELECT id, "firstName", "lastName", email, phone, address, city, country, 
             "postalCode", "dateOfBirth", avatar, role, "isActive", "isVerified", 
             "createdAt", "lastLogin", "accountId"
      FROM users WHERE id = $1
    `, [req.params.id]);

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const accounts = await dbAsync.all('SELECT * FROM accounts WHERE "userId" = $1', [req.params.id]);
    const transactions = await dbAsync.all('SELECT * FROM transactions WHERE "userId" = $1 ORDER BY date DESC LIMIT 10', [req.params.id]);
    const loans = await dbAsync.all('SELECT * FROM loans WHERE "userId" = $1 ORDER BY "appliedDate" DESC', [req.params.id]);

    res.json({ success: true, data: { user, accounts, transactions, loans } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user details' });
  }
});

// 4. Update user
router.put('/users/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, isActive } = req.body;
    await dbAsync.run(`
      UPDATE users 
      SET "firstName" = COALESCE($1, "firstName"),
          "lastName" = COALESCE($2, "lastName"),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          "isActive" = COALESCE($5, "isActive"),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [firstName, lastName, email, phone, isActive !== undefined ? isActive : null, req.params.id]);

    const user = await dbAsync.get('SELECT * FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'User updated successfully', data: { user } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating user' });
  }
});

// 5. Fund user account
router.post('/fund-account', authenticate, authorizeAdmin, [
  body('accountId').notEmpty(),
  body('amount').isFloat({ min: 1 })
], async (req, res) => {
  try {
    const { accountId, amount, description } = req.body;
    const account = await dbAsync.get('SELECT * FROM accounts WHERE id = $1', [accountId]);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    await dbAsync.run('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, accountId]);

    const transactionId = uuidv4();
    await dbAsync.run(`
      INSERT INTO transactions (id, "accountId", "userId", type, amount, currency, description, status, category, reference)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [transactionId, accountId, account.userId, 'deposit', amount, account.currency, description || 'Admin funding', 'completed', 'Deposit', 'ADMIN-' + Date.now()]);

    await dbAsync.run(`INSERT INTO "adminActions" (id, "adminId", "actionType", "targetUserId", details) VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), req.user.id, 'fund_account', account.userId, `Funded $${amount}`]);

    res.json({ success: true, message: 'Account funded successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error funding account' });
  }
});

// 6. Admin Actions (Password, PIN, Account Number)
router.post('/users/:id/change-password', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.newPassword, 10);
    await dbAsync.run('UPDATE users SET password = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, req.params.id]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/users/:id/change-pin', authenticate, authorizeAdmin, async (req, res) => {
  try {
    await dbAsync.run('UPDATE users SET pin = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [req.body.newPin, req.params.id]);
    res.json({ success: true, message: 'PIN changed successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/accounts/:id/change-number', authenticate, authorizeAdmin, async (req, res) => {
  try {
    await dbAsync.run('UPDATE accounts SET "accountNumber" = $1 WHERE id = $2', [req.body.newAccountNumber, req.params.id]);
    res.json({ success: true, message: 'Account number changed successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 7. Get system activities
router.get('/activities', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const activities = await dbAsync.all(`
      SELECT a.*, u."firstName", u."lastName"
      FROM "adminActions" a
      JOIN users u ON a."adminId" = u.id
      ORDER BY a."performedAt" DESC LIMIT $1
    `, [parseInt(req.query.limit || 50)]);
    res.json({ success: true, data: { activities } });
  } catch (error) { res.status(500).json({ success: false, message: 'Error fetching activities' }); }
});

module.exports = router;