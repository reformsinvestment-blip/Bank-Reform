const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); // Using your dbAsync helper
const { sendEmail } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid'); 
const router = express.Router();

// 1. Generate account statement
router.post('/generate', authenticate, [
  body('accountId').notEmpty(),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('format').optional().isIn(['pdf', 'csv', 'json'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, startDate, endDate, format = 'pdf' } = req.body;
    const userId = req.user.id;

    // Verify account ownership - Fixed Quotes
    const account = await db.get(
      'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
      [accountId, userId]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Get transactions for the period - Fixed Quotes
    const transactions = await db.all(
      `SELECT * FROM transactions 
       WHERE "accountId" = $1 
       AND "date" BETWEEN $2 AND $3
       ORDER BY "date" DESC`,
      [accountId, startDate, endDate]
    );

    // Summary calculation (Preserved Logic)
    const summary = {
      openingBalance: 0,
      closingBalance: Number(account.balance),
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalTransfers: 0,
      transactionCount: transactions.length
    };

    transactions.forEach(tx => {
      const amt = parseFloat(tx.amount);
      if (tx.type === 'deposit') {
        summary.totalDeposits += amt;
      } else if (tx.type === 'withdrawal') {
        summary.totalWithdrawals += Math.abs(amt);
      } else if (tx.type === 'transfer') {
        summary.totalTransfers += Math.abs(amt);
      }
    });

    summary.openingBalance = summary.closingBalance - 
      (summary.totalDeposits - summary.totalWithdrawals - summary.totalTransfers);

    const statementRef = `STMT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Store statement record - Fixed Quotes and CURRENT_TIMESTAMP
    await db.run(
      `INSERT INTO statements (id, "userId", "accountId", "statementRef", "startDate", "endDate", format, "generatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [uuidv4(), userId, accountId, statementRef, startDate, endDate, format]
    );

    let statementContent;
    let contentType;
    let filename;

    // Format Logic (Preserved)
    switch (format) {
      case 'json':
        statementContent = JSON.stringify({
          statementRef,
          account: { accountNumber: account.accountNumber, accountType: account.accountType, currency: account.currency },
          period: { startDate, endDate },
          summary,
          transactions
        }, null, 2);
        contentType = 'application/json';
        filename = `statement_${account.accountNumber}_${startDate}.json`;
        break;
      
      case 'csv':
        statementContent = generateCSV(transactions, account, summary);
        contentType = 'text/csv';
        filename = `statement_${account.accountNumber}_${startDate}.csv`;
        break;
      
      case 'pdf':
      default:
        statementContent = {
          statementRef,
          generatedAt: new Date().toISOString(),
          account: {
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            currency: account.currency,
            holderName: req.user.firstName + ' ' + req.user.lastName
          },
          period: { startDate, endDate },
          summary,
          transactions: transactions.map(tx => ({
            date: tx.date,
            reference: tx.reference,
            description: tx.description,
            type: tx.type,
            amount: tx.amount,
            currency: tx.currency
          }))
        };
        contentType = 'application/json';
        filename = `statement_${account.accountNumber}_${startDate}.pdf`;
        break;
    }

    // Send notification email
    await sendEmail({
      to: req.user.email,
      subject: 'Account Statement Generated',
      template: 'statementGenerated',
      data: {
        name: req.user.firstName,
        accountNumber: account.accountNumber,
        period: `${startDate} to ${endDate}`,
        statementRef
      }
    });

    res.json({
      success: true,
      message: 'Statement generated successfully',
      statementRef,
      format,
      content: statementContent,
      contentType,
      filename,
      summary
    });

  } catch (error) {
    console.error('Statement generation error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate statement' });
  }
});

// 2. Get user's statement history
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM statements WHERE "userId" = $1';
    let params = [userId];

    if (accountId) {
      query += ` AND "accountId" = $${params.length + 1}`;
      params.push(accountId);
    }

    query += ` ORDER BY "generatedAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const statements = await db.all(query, params);
    const countData = await db.get('SELECT COUNT(*) as total FROM statements WHERE "userId" = $1', [userId]);

    res.json({
      success: true,
      statements,
      pagination: {
        total: parseInt(countData.total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve history' });
  }
});

// 3. Get statement by reference
router.get('/:reference', authenticate, async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    const statement = await db.get(
      `SELECT s.*, a."accountNumber", a."accountType", a.currency
       FROM statements s
       JOIN accounts a ON s."accountId" = a.id
       WHERE s."statementRef" = $1 AND s."userId" = $2`,
      [reference, userId]
    );

    if (!statement) {
      return res.status(404).json({ success: false, message: 'Statement not found' });
    }

    const transactions = await db.all(
      `SELECT * FROM transactions 
       WHERE "accountId" = $1 
       AND "date" BETWEEN $2 AND $3
       ORDER BY "date" DESC`,
      [statement.accountId, statement.startDate, statement.endDate]
    );

    res.json({ success: true, statement, transactions });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve statement' });
  }
});

// Helper function to generate CSV (Preserved exactly)
function generateCSV(transactions, account, summary) {
  let csv = 'Account Statement\n';
  csv += `Account Number,${account.accountNumber}\n`;
  csv += `Account Type,${account.accountType}\n`;
  csv += `Currency,${account.currency}\n\n`;
  csv += 'Date,Reference,Description,Type,Amount\n';
  
  transactions.forEach(tx => {
    csv += `${tx.date},${tx.reference},${tx.description},${tx.type},${tx.amount}\n`;
  });
  
  return csv;
}

module.exports = router;