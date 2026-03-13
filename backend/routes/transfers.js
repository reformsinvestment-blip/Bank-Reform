const express = require('express')
const { body, validationResult } = require('express-validator')
const { v4: uuidv4 } = require('uuid')
const { authenticate } = require('../middleware/auth')
const { dbAsync } = require('../database/db')
const { createTransaction } = require('./transactions')
const { sendEmail } = require('../services/emailService')

const router = express.Router()

const sanitizeAmount = v => parseFloat(String(v).replace(/,/g, '').trim())

// -------------------- Local Transfer --------------------
router.post(
  '/local',
  authenticate,
  [
    body('fromAccountId').notEmpty().withMessage('Source account is required'),
    body('toAccountNumber').notEmpty().withMessage('Recipient account number is required'),
    body('recipientName').trim().isLength({ min: 2 }).withMessage('Recipient name must be at least 2 characters'),
    body('amount')
      .customSanitizer(sanitizeAmount)
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
      const parsedAmount = sanitizeAmount(amount)

      // FIX: Added quotes for "userId" and used $ placeholders
      const fromAccount = await dbAsync.get(
        'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
        [fromAccountId, req.user.id]
      )
      
      if (!fromAccount) {
        return res.status(404).json({ success: false, message: 'Source account not found' })
      }

      // Postgres balance check
      if (Number(fromAccount.balance) < parsedAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Available balance: $${Number(fromAccount.balance).toFixed(2)}, required: $${parsedAmount.toFixed(2)}`
        })
      }

      // Check if recipient is internal
      const toAccount = await dbAsync.get(
        'SELECT * FROM accounts WHERE "accountNumber" = $1',
        [toAccountNumber]
      )

      // 1. Debit Source
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

      // 2. Credit Destination (If internal)
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
    body('amount')
      .customSanitizer(sanitizeAmount)
      .isFloat({ min: 1 })
      .withMessage('Amount must be a number greater than 0')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg })
      }

      const { fromAccountId, recipientName, recipientAccount, recipientBank, swiftCode, iban, amount, description } = req.body
      const parsedAmount = sanitizeAmount(amount)

      const account = await dbAsync.get(
        'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
        [fromAccountId, req.user.id]
      )
      
      if (!account) return res.status(404).json({ success: false, message: 'Account not found' })

      const intlFee = 45
      const totalDebit = parsedAmount + intlFee

      if (Number(account.balance) < totalDebit) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Transfer amount $${parsedAmount.toFixed(2)} + $${intlFee} fee = $${totalDebit.toFixed(2)} required. Available: $${Number(account.balance).toFixed(2)}`
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
    body('amount')
      .customSanitizer(sanitizeAmount)
      .isFloat({ min: 1 })
      .withMessage('Amount must be a number greater than 0'),
    body('cotCode').notEmpty().withMessage('COT code is required'),
    body('taxCode').notEmpty().withMessage('Tax code is required'),
    body('imfCode').notEmpty().withMessage('IMF code is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg })
      }

      const {
        fromAccountId, recipientName, recipientAccount, recipientBank,
        swiftCode, iban, amount, description, cotCode, taxCode, imfCode
      } = req.body
      const parsedAmount = sanitizeAmount(amount)

      const account = await dbAsync.get(
        'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
        [fromAccountId, req.user.id]
      )
      
      if (!account) return res.status(404).json({ success: false, message: 'Account not found' })

      const wireFee = 45
      const totalDebit = parsedAmount + wireFee

      if (Number(account.balance) < totalDebit) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Transfer amount $${parsedAmount.toFixed(2)} + $${wireFee} fee = $${totalDebit.toFixed(2)} required. Available: $${Number(account.balance).toFixed(2)}`
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
        data: { transaction, fee: wireFee }
      })
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error processing wire transfer' })
    }
  }
)

module.exports = router