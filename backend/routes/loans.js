const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// Calculate loan details (Preserved Logic)
const calculateLoan = (amount, interestRate, term) => {
  const monthlyRate = interestRate / 100 / 12;
  const monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, term)) / 
                        (Math.pow(1 + monthlyRate, term) - 1);
  const totalPayable = monthlyPayment * term;
  const totalInterest = totalPayable - amount;

  return {
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    totalPayable: Math.round(totalPayable * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100
  };
};

// 1. Get all loans for current user
router.get('/', authenticate, async (req, res) => {
  try {
    // FIX: Quotes for "userId" and "appliedDate"
    const loans = await db.all(`
      SELECT * FROM loans 
      WHERE "userId" = $1 
      ORDER BY "appliedDate" DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: { loans }
    });

  } catch (error) {
    console.error('Get loans error:', error);
    res.status(500).json({ success: false, message: 'Error fetching loans' });
  }
});

// 2. Get single loan
router.get('/:id', authenticate, async (req, res) => {
  try {
    // FIX: Quotes for "userId"
    const loan = await db.get(`
      SELECT * FROM loans 
      WHERE id = $1 AND "userId" = $2
    `, [req.params.id, req.user.id]);

    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    res.json({
      success: true,
      data: { loan }
    });

  } catch (error) {
    console.error('Get loan error:', error);
    res.status(500).json({ success: false, message: 'Error fetching loan' });
  }
});

// 3. Apply for loan
router.post('/apply', authenticate, [
  body('loanType').isIn(['personal', 'home', 'auto', 'education', 'business']),
  body('amount').isFloat({ min: 1000, max: 500000 }),
  body('term').isInt({ min: 12, max: 360 }),
  body('purpose').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { loanType, amount, term, purpose } = req.body;

    const interestRates = {
      personal: 8.5, home: 5.25, auto: 6.99, education: 4.5, business: 9.5
    };

    const interestRate = interestRates[loanType];
    const loanCalc = calculateLoan(amount, interestRate, term);
    const loanId = uuidv4();

    // FIX: Full quotes for all CamelCase columns
    await db.run(`
      INSERT INTO loans (
        id, "userId", "loanType", amount, "interestRate", term, 
        "monthlyPayment", "totalPayable", "remainingAmount", status, purpose
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      loanId, req.user.id, loanType, amount, interestRate, term,
      loanCalc.monthlyPayment, loanCalc.totalPayable, amount, 'pending', purpose
    ]);

    const loan = await db.get('SELECT * FROM loans WHERE id = $1', [loanId]);

    // Send confirmation email (Preserved Logic)
    await sendEmail({
      to: req.user.email,
      subject: 'Loan Application Received - SecureBank',
      template: 'welcome',
      data: {
        firstName: req.user.firstName,
        loanType,
        amount: `$${amount.toLocaleString()}`,
        term: `${term} months`,
        monthlyPayment: `$${loanCalc.monthlyPayment.toFixed(2)}`
      }
    });

    res.status(201).json({
      success: true,
      message: 'Loan application submitted successfully',
      data: { loan }
    });

  } catch (error) {
    console.error('Apply loan error:', error);
    res.status(500).json({ success: false, message: 'Error submitting loan application' });
  }
});

// 4. Calculate loan preview
router.post('/calculate', async (req, res) => {
  try {
    const { amount, interestRate, term } = req.body;
    const loanCalc = calculateLoan(amount, interestRate, term);

    res.json({
      success: true,
      data: {
        monthlyPayment: loanCalc.monthlyPayment,
        totalPayable: loanCalc.totalPayable,
        totalInterest: loanCalc.totalInterest
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error calculating loan' });
  }
});

// 5. Admin: Get all pending loans
router.get('/admin/pending', authenticate, authorizeAdmin, async (req, res) => {
  try {
    // FIX: JOIN columns and sorting
    const loans = await db.all(`
      SELECT l.*, u."firstName", u."lastName", u.email
      FROM loans l
      JOIN users u ON l."userId" = u.id
      WHERE l.status = 'pending'
      ORDER BY l."appliedDate" ASC
    `);

    res.json({
      success: true,
      data: { loans }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching pending loans' });
  }
});

// 6. Admin: Approve loan
router.post('/admin/:id/approve', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const loan = await db.get('SELECT * FROM loans WHERE id = $1', [req.params.id]);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });

    // FIX: Postgres syntax for adding 1 month interval
    await db.run(`
      UPDATE loans 
      SET status = 'approved', 
          "approvedDate" = CURRENT_TIMESTAMP, 
          "nextPaymentDate" = CURRENT_DATE + INTERVAL '1 month'
      WHERE id = $1
    `, [req.params.id]);

    const user = await db.get('SELECT email, "firstName" FROM users WHERE id = $1', [loan.userId]);

    await sendEmail({
      to: user.email,
      subject: 'Loan Application Approved - SecureBank',
      template: 'loanApproved',
      data: {
        firstName: user.firstName,
        loanType: loan.loanType,
        amount: `$${parseFloat(loan.amount).toLocaleString()}`,
        interestRate: loan.interestRate,
        monthlyPayment: `$${parseFloat(loan.monthlyPayment).toFixed(2)}`,
        term: `${loan.term} months`
      }
    });

    res.json({ success: true, message: 'Loan approved successfully' });
  } catch (error) {
    console.error('Approve loan error:', error);
    res.status(500).json({ success: false, message: 'Error approving loan' });
  }
});

// 7. Admin: Reject loan
router.post('/admin/:id/reject', authenticate, authorizeAdmin, [
  body('reason').notEmpty()
], async (req, res) => {
  try {
    const { reason } = req.body;
    const loan = await db.get('SELECT * FROM loans WHERE id = $1', [req.params.id]);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });

    // FIX: Quotes for rejectedDate and rejectionReason
    await db.run(`
      UPDATE loans 
      SET status = 'rejected', 
          "rejectedDate" = CURRENT_TIMESTAMP, 
          "rejectionReason" = $1
      WHERE id = $2
    `, [reason, req.params.id]);

    const user = await db.get('SELECT email, "firstName" FROM users WHERE id = $1', [loan.userId]);

    await sendEmail({
      to: user.email,
      subject: 'Loan Application Update - SecureBank',
      template: 'welcome',
      data: { firstName: user.firstName, loanType: loan.loanType, reason }
    });

    res.json({ success: true, message: 'Loan rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error rejecting loan' });
  }
});

module.exports = router;