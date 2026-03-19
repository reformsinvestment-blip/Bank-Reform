const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); // Consistent use of 'db'
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// 1. Get admin dashboard stats
router.get('/stats', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const userStats = await db.get(`
      SELECT 
        COUNT(*) as "totalUsers",
        SUM(CASE WHEN "isActive" = true THEN 1 ELSE 0 END) as "activeUsers",
        SUM(CASE WHEN "createdAt"::date = CURRENT_DATE THEN 1 ELSE 0 END) as "newUsersToday"
      FROM users WHERE role = 'user'
    `);

    const accountStats = await db.get(`SELECT COUNT(*) as "totalAccounts", SUM(balance) as "totalBalance" FROM accounts`);

    const transactionStats = await db.get(`
      SELECT COUNT(*) as "totalTransactions",
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as "totalDeposits",
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as "totalWithdrawals"
      FROM transactions WHERE date::date = CURRENT_DATE
    `);

    const pendingLoans = await db.get("SELECT COUNT(*) as count FROM loans WHERE status = 'pending'");
    const pendingDeposits = await db.get("SELECT COUNT(*) as count FROM deposits WHERE status = 'pending'");

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
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Get all users
router.get('/users', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `SELECT id, "firstName", "lastName", email, phone, role, "isActive", "isVerified", status, "kycStatus", "createdAt" FROM users WHERE role = 'user'`;
    const params = [];

    if (search) {
      sql += ` AND (email ILIKE ? OR "firstName" ILIKE ? OR "lastName" ILIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const users = await db.all(sql + ` ORDER BY "createdAt" DESC`, params);
    res.json({ success: true, data: { users } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── 3. NEW ROUTE: VIEW KYC DOCUMENTS ───
router.get('/users/:id/kyc-docs', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const docs = await db.get(
      'SELECT * FROM "kycSubmissions" WHERE "userId" = ? ORDER BY "submittedAt" DESC LIMIT 1',
      [req.params.id]
    );
    if (!docs) return res.status(404).json({ success: false, message: 'No documents uploaded yet' });
    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Get single user details
router.get('/users/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const user = await db.get(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const accounts = await db.all('SELECT * FROM accounts WHERE "userId" = ?', [req.params.id]);
    const transactions = await db.all('SELECT * FROM transactions WHERE "userId" = ? ORDER BY date DESC LIMIT 10', [req.params.id]);
    const loans = await db.all('SELECT * FROM loans WHERE "userId" = ? ORDER BY "appliedDate" DESC', [req.params.id]);

    res.json({ success: true, data: { user, accounts, transactions, loans } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Approve KYC and Create Account
router.post('/users/:id/approve-kyc', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Update User status to ACTIVE
    await db.run(`
      UPDATE users 
      SET status = 'active', "isVerified" = true, "kycStatus" = 'approved', "updatedAt" = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [userId]);

    // Create the Bank Account (Checking for existing to prevent duplicates)
    const existingAcc = await db.get('SELECT id FROM accounts WHERE "userId" = ?', [userId]);
    let accountNumber = '';
    
    if (!existingAcc) {
      accountNumber = 'CHK' + Date.now().toString().slice(-8);
      await db.run(`
        INSERT INTO accounts (id, "userId", "accountNumber", "accountType", balance, currency, status)
        VALUES (?, ?, ?, 'checking', 50.00, 'USD', 'active')
      `, [uuidv4(), userId, accountNumber]); // Bonus: Gave them $50 for joining
    }

    // Send the Activation Email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Account Approved & Active! - BIFRC',
        template: 'welcome', 
        data: {
          firstName: user.firstName,
          message: `Your identity has been verified. Your checking account is now active. Login now to view your dashboard.`
        }
      });
    } catch (mailErr) { console.error("Email failed, but user is approved."); }

    res.json({ success: true, message: 'User approved and account created' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Reject KYC
router.post('/users/:id/reject-kyc', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    await db.run('UPDATE users SET "kycStatus" = ?, "kycRejectedReason" = ?, status = ? WHERE id = ?', 
      ['rejected', reason, 'inactive', req.params.id]);
    
    res.json({ success: true, message: 'User rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. Fund user account
router.post('/fund-account', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { accountId, amount, description } = req.body;
    const account = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    await db.run('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, accountId]);

    await db.run(`
      INSERT INTO transactions (id, "accountId", "userId", type, amount, currency, description, status, category, reference)
      VALUES (?, ?, ?, 'deposit', ?, ?, ?, 'completed', 'Deposit', ?)
    `, [uuidv4(), accountId, account.userId, amount, account.currency, description || 'Admin funding', 'ADMIN-' + Date.now()]);

    res.json({ success: true, message: 'Account funded successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. Pending KYC List
router.get('/kyc/pending', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, "firstName", "lastName", email, "kycStatus", "createdAt" 
      FROM users WHERE status = 'pending_review' OR "kycStatus" = 'pending_review'
      ORDER BY "createdAt" ASC
    `);
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 9. Admin Security Actions
router.post('/users/:id/change-password', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.params.id]);
    res.json({ success: true, message: 'Password changed' });
  } catch (e) { res.status(500).json({ success: false }); }
});

router.post('/users/:id/change-pin', authenticate, authorizeAdmin, async (req, res) => {
  try {
    await db.run('UPDATE users SET pin = ? WHERE id = ?', [req.body.newPin, req.params.id]);
    res.json({ success: true, message: 'PIN updated' });
  } catch (e) { res.status(500).json({ success: false }); }
});
//10 activities 
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
})

module.exports = router;