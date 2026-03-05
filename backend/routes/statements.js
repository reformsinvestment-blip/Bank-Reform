const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const db = require('../database/db');
const { sendEmail } = require('../services/emailService');
const router = express.Router();

// Generate account statement
router.post('/generate', authenticate, [
  body('accountId').notEmpty(),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('format').optional().isIn(['pdf', 'csv', 'json'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { accountId, startDate, endDate, format = 'pdf' } = req.body;
    const userId = req.user.id;

    // Verify account belongs to user
    const account = await db.get(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [accountId, userId]
    );

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Get transactions for the period
    const transactions = await db.all(
      `SELECT * FROM transactions 
       WHERE accountId = ? 
       AND createdAt BETWEEN ? AND ?
       ORDER BY createdAt DESC`,
      [accountId, startDate, endDate]
    );

    // Calculate summary
    const summary = {
      openingBalance: 0,
      closingBalance: account.balance,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalTransfers: 0,
      transactionCount: transactions.length
    };

    transactions.forEach(tx => {
      if (tx.type === 'deposit') {
        summary.totalDeposits += tx.amount;
      } else if (tx.type === 'withdrawal') {
        summary.totalWithdrawals += tx.amount;
      } else if (tx.type === 'transfer') {
        summary.totalTransfers += tx.amount;
      }
    });

    summary.openingBalance = account.balance - 
      (summary.totalDeposits - summary.totalWithdrawals - summary.totalTransfers);

    // Generate statement reference
    const statementRef = `STMT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Store statement record
    await db.run(
      `INSERT INTO statements (userId, accountId, statementRef, startDate, endDate, format, generatedAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [userId, accountId, statementRef, startDate, endDate, format]
    );

    // Generate statement content based on format
    let statementContent;
    let contentType;
    let filename;

    switch (format) {
      case 'json':
        statementContent = JSON.stringify({
          statementRef,
          account: {
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            currency: account.currency
          },
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
        // For PDF, return structured data that frontend can format
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
            date: tx.createdAt,
            reference: tx.reference,
            description: tx.description,
            type: tx.type,
            amount: tx.amount,
            currency: tx.currency,
            balance: tx.balanceAfter
          }))
        };
        contentType = 'application/json';
        filename = `statement_${account.accountNumber}_${startDate}.pdf`;
        break;
    }

    // Send email notification
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
    res.status(500).json({ message: 'Failed to generate statement' });
  }
});

// Get user's statement history
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM statements WHERE userId = ?';
    let params = [userId];

    if (accountId) {
      query += ' AND accountId = ?';
      params.push(accountId);
    }

    query += ' ORDER BY generatedAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const statements = await db.all(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM statements WHERE userId = ?';
    let countParams = [userId];

    if (accountId) {
      countQuery += ' AND accountId = ?';
      countParams.push(accountId);
    }

    const { total } = await db.get(countQuery, countParams);

    res.json({
      statements,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get statement history error:', error);
    res.status(500).json({ message: 'Failed to retrieve statement history' });
  }
});

// Get statement by reference
router.get('/:reference', authenticate, async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    const statement = await db.get(
      `SELECT s.*, a.accountNumber, a.accountType, a.currency
       FROM statements s
       JOIN accounts a ON s.accountId = a.id
       WHERE s.statementRef = ? AND s.userId = ?`,
      [reference, userId]
    );

    if (!statement) {
      return res.status(404).json({ message: 'Statement not found' });
    }

    // Get transactions for this statement period
    const transactions = await db.all(
      `SELECT * FROM transactions 
       WHERE accountId = ? 
       AND createdAt BETWEEN ? AND ?
       ORDER BY createdAt DESC`,
      [statement.accountId, statement.startDate, statement.endDate]
    );

    res.json({
      statement,
      transactions
    });

  } catch (error) {
    console.error('Get statement error:', error);
    res.status(500).json({ message: 'Failed to retrieve statement' });
  }
});

// Download statement
router.get('/:reference/download', authenticate, async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    const statement = await db.get(
      'SELECT * FROM statements WHERE statementRef = ? AND userId = ?',
      [reference, userId]
    );

    if (!statement) {
      return res.status(404).json({ message: 'Statement not found' });
    }

    // Regenerate statement content
    const account = await db.get(
      'SELECT * FROM accounts WHERE id = ?',
      [statement.accountId]
    );

    const transactions = await db.all(
      `SELECT * FROM transactions 
       WHERE accountId = ? 
       AND createdAt BETWEEN ? AND ?
       ORDER BY createdAt DESC`,
      [statement.accountId, statement.startDate, statement.endDate]
    );

    let content;
    let contentType;
    let filename;

    switch (statement.format) {
      case 'json':
        content = JSON.stringify({ statement, transactions }, null, 2);
        contentType = 'application/json';
        filename = `statement_${reference}.json`;
        break;
      case 'csv':
        content = generateCSV(transactions, account, {});
        contentType = 'text/csv';
        filename = `statement_${reference}.csv`;
        break;
      default:
        content = JSON.stringify({ statement, transactions });
        contentType = 'application/json';
        filename = `statement_${reference}.json`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);

  } catch (error) {
    console.error('Download statement error:', error);
    res.status(500).json({ message: 'Failed to download statement' });
  }
});

// Helper function to generate CSV
function generateCSV(transactions, account, summary) {
  let csv = 'Account Statement\n';
  csv += `Account Number,${account.accountNumber}\n`;
  csv += `Account Type,${account.accountType}\n`;
  csv += `Currency,${account.currency}\n\n`;
  
  csv += 'Date,Reference,Description,Type,Amount,Balance\n';
  
  transactions.forEach(tx => {
    csv += `${tx.createdAt},${tx.reference},${tx.description},${tx.type},${tx.amount},${tx.balanceAfter}\n`;
  });
  
  return csv;
}

module.exports = router;
