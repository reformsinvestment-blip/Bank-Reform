const express = require('express')
const { body, validationResult } = require('express-validator')
const { v4: uuidv4 } = require('uuid')
const { authenticate } = require('../middleware/auth')
const { dbAsync } = require('../database/db')
const { createTransaction } = require('./transactions')
const { sendEmail } = require('../services/emailService')

const router = express.Router()

// -------------------- Local Transfer --------------------
router.post(
  '/local',
  authenticate,
  [
    body('fromAccountId').notEmpty().withMessage('Source account is required'),
    body('toAccountNumber').notEmpty().withMessage('Recipient account number is required'),
    body('recipientName').trim().isLength({ min: 2 }).withMessage('Recipient name must be at least 2 characters'),
    // FIX 1: sanitize amount before validating so "1,000" or " 50 " don't fail
    body('amount')
      .customSanitizer(v => parseFloat(String(v).replace(/,/g, '')))
      .isFloat({ min: 1 })
      .withMessage('Amount must be a number greater than 0')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() })
      }

      const { fromAccountId, toAccountNumber, recipientName, amount, description } = req.body
      const parsedAmount = parseFloat(String(amount).replace(/,/g, ''))

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' })
      }

      // FIX 2: Verify source account exists first — gives a clear error instead of silent failure
      const fromAccount = await dbAsync.get(
        'SELECT * FROM accounts WHERE id = ? AND userId = ?',
        [fromAccountId, req.user.id]
      )
      if (!fromAccount) {
        return res.status(404).json({ success: false, message: 'Source account not found' })
      }

      // FIX 3: Show exact shortfall in insufficient funds message
      if (fromAccount.balance < parsedAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Available balance: $${fromAccount.balance.toFixed(2)}, required: $${parsedAmount.toFixed(2)}`
        })
      }

      const toAccount = await dbAsync.get(
        'SELECT * FROM accounts WHERE accountNumber = ?',
        [toAccountNumber]
      )

      const debitTransaction = await createTransaction({
        userId: req.user.id,
        accountId: fromAccountId,
        type: 'local_transfer',
        amount: -parsedAmount,
        description: description || `Transfer to ${recipientName}`,
        recipientName,
        recipientAccount: toAccountNumber,
        category: 'Transfer'
      })

      if (toAccount) {
        await createTransaction({
          userId: toAccount.userId,
          accountId: toAccount.id,
          type: 'local_transfer',
          amount: parsedAmount,
          description: `Transfer from ${req.user.firstName} ${req.user.lastName}`,
          recipientName: `${req.user.firstName} ${req.user.lastName}`,
          category: 'Transfer'
        })
      }

      res.json({
        success: true,
        message: 'Transfer completed successfully',
        data: { transaction: debitTransaction, isInternal: !!toAccount }
      })
    } catch (err) {
      console.error('Local transfer error:', err)
      res.status(500).json({ success: false, message: 'Error processing transfer' })
    }
  }
)

// -------------------- International Transfer --------------------
router.post(
  '/international',
  authenticate,
  [
    body('fromAccountId').notEmpty().withMessage('Source account is required'),
    body('recipientName').trim().isLength({ min: 2 }).withMessage('Recipient name must be at least 2 characters'),
    body('recipientAccount').notEmpty().withMessage('Recipient account number is required'),
    body('recipientBank').notEmpty().withMessage('Bank name is required'),
    body('swiftCode').notEmpty().withMessage('SWIFT/BIC code is required'),
    // FIX 1: sanitize amount before validating
    body('amount')
      .customSanitizer(v => parseFloat(String(v).replace(/,/g, '')))
      .isFloat({ min: 1 })
      .withMessage('Amount must be a number greater than 0')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() })
      }

      const { fromAccountId, recipientName, recipientAccount, recipientBank, swiftCode, iban, amount, description } = req.body
      const parsedAmount = parseFloat(String(amount).replace(/,/g, ''))

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' })
      }

      const account = await dbAsync.get(
        'SELECT * FROM accounts WHERE id = ? AND userId = ?',
        [fromAccountId, req.user.id]
      )
      if (!account) {
        return res.status(404).json({ success: false, message: 'Source account not found' })
      }

      const intlFee = 45
      const totalDebit = parsedAmount + intlFee

      // FIX 3: Tell the user the fee is part of the problem
      if (account.balance < totalDebit) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Transfer amount $${parsedAmount.toFixed(2)} + $${intlFee} fee = $${totalDebit.toFixed(2)} required. Available: $${account.balance.toFixed(2)}`
        })
      }

      const transaction = await createTransaction({
        userId: req.user.id,
        accountId: fromAccountId,
        type: 'international_transfer',
        amount: -totalDebit,
        description: description || `International transfer to ${recipientName}`,
        recipientName,
        recipientAccount,
        recipientBank,
        swiftCode,
        iban: iban || '',
        category: 'Transfer',
        fee: intlFee
      })

      res.json({
        success: true,
        message: 'International transfer initiated',
        data: { transaction, fee: intlFee, estimatedDelivery: '2-5 business days' }
      })
    } catch (err) {
      console.error('International transfer error:', err)
      res.status(500).json({ success: false, message: 'Error processing transfer' })
    }
  }
)

// -------------------- Wire Transfer --------------------
router.post(
  '/wire',
  authenticate,
  [
    body('fromAccountId').notEmpty().withMessage('Source account is required'),
    body('recipientName').trim().isLength({ min: 2 }).withMessage('Recipient name must be at least 2 characters'),
    body('recipientAccount').notEmpty().withMessage('Recipient account number is required'),
    body('recipientBank').notEmpty().withMessage('Bank name is required'),
    body('swiftCode').notEmpty().withMessage('SWIFT/BIC code is required'),
    // FIX 1: sanitize amount before validating
    body('amount')
      .customSanitizer(v => parseFloat(String(v).replace(/,/g, '')))
      .isFloat({ min: 1 })
      .withMessage('Amount must be a number greater than 0'),
    body('cotCode').notEmpty().isLength({ min: 5 }).withMessage('COT code must be at least 5 characters'),
    body('taxCode').notEmpty().isLength({ min: 5 }).withMessage('Tax code must be at least 5 characters'),
    body('imfCode').notEmpty().isLength({ min: 5 }).withMessage('IMF code must be at least 5 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() })
      }

      const {
        fromAccountId, recipientName, recipientAccount, recipientBank,
        swiftCode, iban, amount, description, cotCode, taxCode, imfCode
      } = req.body
      const parsedAmount = parseFloat(String(amount).replace(/,/g, ''))

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' })
      }

      const account = await dbAsync.get(
        'SELECT * FROM accounts WHERE id = ? AND userId = ?',
        [fromAccountId, req.user.id]
      )
      if (!account) {
        return res.status(404).json({ success: false, message: 'Source account not found' })
      }

      const wireFee = 45
      const totalDebit = parsedAmount + wireFee

      // FIX 3: Tell the user the fee is part of the problem
      if (account.balance < totalDebit) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Transfer amount $${parsedAmount.toFixed(2)} + $${wireFee} fee = $${totalDebit.toFixed(2)} required. Available: $${account.balance.toFixed(2)}`
        })
      }

      const transaction = await createTransaction({
        userId: req.user.id,
        accountId: fromAccountId,
        type: 'wire_transfer',
        amount: -totalDebit,
        description: description || `Wire transfer to ${recipientName}`,
        recipientName,
        recipientAccount,
        recipientBank,
        swiftCode,
        iban: iban || '',
        category: 'Transfer',
        fee: wireFee,
        codes: { cotCode, taxCode, imfCode }
      })

      res.json({
        success: true,
        message: 'Wire transfer initiated successfully',
        data: { transaction, fee: wireFee, estimatedDelivery: '1-3 business days' }
      })
    } catch (err) {
      console.error('Wire transfer error:', err)
      res.status(500).json({ success: false, message: 'Error processing wire transfer' })
    }
  }
)

module.exports = router
