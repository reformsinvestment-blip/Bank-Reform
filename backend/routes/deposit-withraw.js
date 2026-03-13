const express = require('express')
const { body, validationResult } = require('express-validator')
const { authenticate } = require('../middleware/auth')
const { dbAsync } = require('../database/db')
const { createTransaction } = require('./transactions')

const router = express.Router()

const sanitizeAmount = v => parseFloat(String(v).replace(/,/g, '').trim())

// -------------------- Deposit --------------------
router.post(
  '/deposit',
  authenticate,
  [
    body('accountId').notEmpty().withMessage('Account is required'),
    body('amount')
      .customSanitizer(sanitizeAmount)
      .isFloat({ min: 1 })
      .withMessage('Amount must be a number greater than 0'),
    body('method')
      .notEmpty()
      .isIn(['bank_transfer', 'card', 'cash'])
      .withMessage('Invalid deposit method'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() })
      }

      const { accountId, amount, method, description } = req.body
      const parsedAmount = sanitizeAmount(amount)

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' })
      }

      // FIX: Added quotes for "userId" and used $ placeholders
      const account = await dbAsync.get(
        'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
        [accountId, req.user.id]
      )
      
      if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' })
      }

      // Logic preserved exactly
      const transaction = await createTransaction({
        userId: req.user.id,
        accountId,
        type: 'deposit',
        amount: parsedAmount,
        description: description || `Deposit via ${method.replace('_', ' ')}`,
        category: 'Deposit',
        method
      })

      res.json({
        success: true,
        message: `Deposit of $${parsedAmount.toFixed(2)} successful`,
        data: { 
          transaction, 
          newBalance: Number(account.balance) + parsedAmount 
        }
      })
    } catch (err) {
      console.error('Deposit error:', err)
      res.status(500).json({ success: false, message: 'Error processing deposit' })
    }
  }
)

// -------------------- Withdraw --------------------
router.post(
  '/withdraw',
  authenticate,
  [
    body('accountId').notEmpty().withMessage('Account is required'),
    body('amount')
      .customSanitizer(sanitizeAmount)
      .isFloat({ min: 1 })
      .withMessage('Amount must be a number greater than 0'),
    body('method')
      .notEmpty()
      .isIn(['bank_transfer', 'card', 'cash', 'atm'])
      .withMessage('Invalid withdrawal method'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() })
      }

      const { accountId, amount, method, description } = req.body
      const parsedAmount = sanitizeAmount(amount)

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' })
      }

      // FIX: Added quotes for "userId" and used $ placeholders
      const account = await dbAsync.get(
        'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
        [accountId, req.user.id]
      )

      if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' })
      }

      // PostgreSQL returns decimals as strings, so we convert to Number for comparison
      if (Number(account.balance) < parsedAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Available: $${Number(account.balance).toFixed(2)}, requested: $${parsedAmount.toFixed(2)}`
        })
      }

      const transaction = await createTransaction({
        userId: req.user.id,
        accountId,
        type: 'withdrawal',
        amount: -parsedAmount,
        description: description || `Withdrawal via ${method.replace('_', ' ')}`,
        category: 'Withdrawal',
        method
      })

      res.json({
        success: true,
        message: `Withdrawal of $${parsedAmount.toFixed(2)} successful`,
        data: { 
          transaction, 
          newBalance: Number(account.balance) - parsedAmount 
        }
      })
    } catch (err) {
      console.error('Withdrawal error:', err)
      res.status(500).json({ success: false, message: 'Error processing withdrawal' })
    }
  }
)

module.exports = router