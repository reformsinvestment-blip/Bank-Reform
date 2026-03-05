const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync } = require('../database/db');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// Calculate loan details
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

// Get all loans for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const loans = await dbAsync.all(`
      SELECT * FROM loans 
      WHERE userId = ? 
      ORDER BY appliedDate DESC
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

// Get single loan
router.get('/:id', authenticate, async (req, res) => {
  try {
    const loan = await dbAsync.get(`
      SELECT * FROM loans 
      WHERE id = ? AND userId = ?
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

// Apply for loan
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

    // Get interest rate based on loan type
    const interestRates = {
      personal: 8.5,
      home: 5.25,
      auto: 6.99,
      education: 4.5,
      business: 9.5
    };

    const interestRate = interestRates[loanType];
    const loanCalc = calculateLoan(amount, interestRate, term);

    const loanId = uuidv4();

    await dbAsync.run(`
      INSERT INTO loans (
        id, userId, loanType, amount, interestRate, term, 
        monthlyPayment, totalPayable, remainingAmount, status, purpose
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      loanId, req.user.id, loanType, amount, interestRate, term,
      loanCalc.monthlyPayment, loanCalc.totalPayable, amount, 'pending', purpose
    ]);

    const loan = await dbAsync.get('SELECT * FROM loans WHERE id = ?', [loanId]);

    // Send notification to admin (in production, use a queue)
    // Send confirmation to user
    await sendEmail({
      to: req.user.email,
      subject: 'Loan Application Received - SecureBank',
      template: 'welcome',
      userId: req.user.id,
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

// Calculate loan (preview)
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
    console.error('Calculate loan error:', error);
    res.status(500).json({ success: false, message: 'Error calculating loan' });
  }
});

// Admin: Get all pending loans
router.get('/admin/pending', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const loans = await dbAsync.all(`
      SELECT l.*, u.firstName, u.lastName, u.email
      FROM loans l
      JOIN users u ON l.userId = u.id
      WHERE l.status = 'pending'
      ORDER BY l.appliedDate ASC
    `);

    res.json({
      success: true,
      data: { loans }
    });

  } catch (error) {
    console.error('Get pending loans error:', error);
    res.status(500).json({ success: false, message: 'Error fetching pending loans' });
  }
});

// Admin: Approve loan
router.post('/admin/:id/approve', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const loan = await dbAsync.get('SELECT * FROM loans WHERE id = ?', [req.params.id]);

    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    await dbAsync.run(`
      UPDATE loans 
      SET status = 'approved', approvedDate = CURRENT_TIMESTAMP, nextPaymentDate = date('now', '+1 month')
      WHERE id = ?
    `, [req.params.id]);

    // Get user details
    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [loan.userId]);

    // Send approval email
    await sendEmail({
      to: user.email,
      subject: 'Loan Application Approved - SecureBank',
      template: 'loanApproved',
      userId: user.id,
      data: {
        firstName: user.firstName,
        loanType: loan.loanType,
        amount: `$${loan.amount.toLocaleString()}`,
        interestRate: loan.interestRate,
        monthlyPayment: `$${loan.monthlyPayment.toFixed(2)}`,
        term: `${loan.term} months`
      }
    });

    res.json({
      success: true,
      message: 'Loan approved successfully'
    });

  } catch (error) {
    console.error('Approve loan error:', error);
    res.status(500).json({ success: false, message: 'Error approving loan' });
  }
});

// Admin: Reject loan
router.post('/admin/:id/reject', authenticate, authorizeAdmin, [
  body('reason').notEmpty()
], async (req, res) => {
  try {
    const { reason } = req.body;

    const loan = await dbAsync.get('SELECT * FROM loans WHERE id = ?', [req.params.id]);

    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    await dbAsync.run(`
      UPDATE loans 
      SET status = 'rejected', rejectedDate = CURRENT_TIMESTAMP, rejectionReason = ?
      WHERE id = ?
    `, [reason, req.params.id]);

    // Get user details
    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [loan.userId]);

    // Send rejection email
    await sendEmail({
      to: user.email,
      subject: 'Loan Application Update - SecureBank',
      template: 'welcome',
      userId: user.id,
      data: {
        firstName: user.firstName,
        loanType: loan.loanType
      }
    });

    res.json({
      success: true,
      message: 'Loan rejected'
    });

  } catch (error) {
    console.error('Reject loan error:', error);
    res.status(500).json({ success: false, message: 'Error rejecting loan' });
  }
});

module.exports = router;
