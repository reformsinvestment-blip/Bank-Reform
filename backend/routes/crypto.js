const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { dbAsync } = require('../database/db');
// Assuming createTransaction is a helper in transactions.js or similar
// If it fails, we will use a direct dbAsync call below
const { createTransaction } = require('./transactions');

const router = express.Router();

// Mock crypto prices (Preserved)
const cryptoPrices = {
  BTC: { price: 52000, change24h: 2.5 },
  ETH: { price: 3200, change24h: 1.8 },
  SOL: { price: 110, change24h: 5.2 },
  ADA: { price: 0.65, change24h: -1.2 },
  DOT: { price: 8.50, change24h: 0.8 }
};

// 1. Get crypto prices
router.get('/prices', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: { prices: cryptoPrices }
    });
  } catch (error) {
    console.error('Get prices error:', error);
    res.status(500).json({ success: false, message: 'Error fetching prices' });
  }
});

// 2. Get user's crypto holdings
router.get('/holdings', authenticate, async (req, res) => {
  try {
    // FIX: Table and Column Quotes
    const holdings = await dbAsync.all(`
      SELECT * FROM "cryptoHoldings" 
      WHERE "userId" = $1
    `, [req.user.id]);

    // Update current values based on current prices (Logic Preserved)
    const updatedHoldings = holdings.map(h => {
      const currentPrice = cryptoPrices[h.symbol]?.price || h.purchasePrice;
      const totalValue = h.quantity * currentPrice;
      const profitLoss = totalValue - (h.quantity * h.purchasePrice);
      
      return {
        ...h,
        currentPrice,
        totalValue: Math.round(totalValue * 100) / 100,
        profitLoss: Math.round(profitLoss * 100) / 100
      };
    });

    res.json({
      success: true,
      data: { holdings: updatedHoldings }
    });

  } catch (error) {
    console.error('Get holdings error:', error);
    res.status(500).json({ success: false, message: 'Error fetching holdings' });
  }
});

// 3. Buy crypto
router.post('/buy', authenticate, [
  body('accountId').notEmpty(),
  body('cryptoType').notEmpty(),
  body('symbol').notEmpty(),
  body('amount').isFloat({ min: 10 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, cryptoType, symbol, amount } = req.body;

    // Verify account ownership
    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const cryptoPrice = cryptoPrices[symbol]?.price;
    if (!cryptoPrice) {
      return res.status(400).json({ success: false, message: 'Invalid cryptocurrency' });
    }

    const fee = amount * 0.015;
    const netAmount = amount - fee;
    const cryptoAmount = netAmount / cryptoPrice;

    if (parseFloat(account.balance) < parseFloat(amount)) {
      return res.status(400).json({ success: false, message: 'Insufficient funds' });
    }

    // Deduct fiat from account
    await dbAsync.run(
        'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
        [amount, accountId]
    );

    // Create transaction record
    const transId = uuidv4();
    await dbAsync.run(`
        INSERT INTO transactions (id, "accountId", "userId", type, amount, description, status, category, fee)
        VALUES ($1, $2, $3, 'crypto_purchase', $4, $5, 'completed', 'Crypto', $6)
    `, [transId, accountId, req.user.id, -amount, `Purchase ${cryptoAmount.toFixed(6)} ${symbol}`, fee]);

    // Check if user already has this crypto
    const existingHolding = await dbAsync.get(
      'SELECT * FROM "cryptoHoldings" WHERE "userId" = $1 AND symbol = $2',
      [req.user.id, symbol]
    );

    if (existingHolding) {
      const newQuantity = parseFloat(existingHolding.quantity) + cryptoAmount;
      const newPurchasePrice = ((parseFloat(existingHolding.quantity) * parseFloat(existingHolding.purchasePrice)) + (cryptoAmount * cryptoPrice)) / newQuantity;
      
      await dbAsync.run(`
        UPDATE "cryptoHoldings" 
        SET quantity = $1, "purchasePrice" = $2, "totalValue" = $3, "currentPrice" = $4
        WHERE id = $5
      `, [newQuantity, newPurchasePrice, newQuantity * cryptoPrice, cryptoPrice, existingHolding.id]);

    } else {
      const holdingId = uuidv4();
      await dbAsync.run(`
        INSERT INTO "cryptoHoldings" (id, "userId", "cryptoType", symbol, quantity, "purchasePrice", "currentPrice", "totalValue")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [holdingId, req.user.id, cryptoType, symbol, cryptoAmount, cryptoPrice, cryptoPrice, cryptoAmount * cryptoPrice]);
    }

    res.json({
      success: true,
      message: 'Crypto purchased successfully',
      data: {
        cryptoAmount: Math.round(cryptoAmount * 1000000) / 1000000,
        fee: Math.round(fee * 100) / 100
      }
    });

  } catch (error) {
    console.error('Buy crypto error:', error);
    res.status(500).json({ success: false, message: 'Error buying crypto: ' + error.message });
  }
});

// 4. Sell crypto
router.post('/sell', authenticate, [
  body('accountId').notEmpty(),
  body('symbol').notEmpty(),
  body('quantity').isFloat({ min: 0.0001 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { accountId, symbol, quantity } = req.body;

    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = $1 AND "userId" = $2',
      [accountId, req.user.id]
    );

    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const holding = await dbAsync.get(
      'SELECT * FROM "cryptoHoldings" WHERE "userId" = $1 AND symbol = $2',
      [req.user.id, symbol]
    );

    if (!holding || parseFloat(holding.quantity) < parseFloat(quantity)) {
      return res.status(400).json({ success: false, message: 'Insufficient crypto balance' });
    }

    const currentPrice = cryptoPrices[symbol]?.price;
    const grossProceeds = quantity * currentPrice;
    const fee = grossProceeds * 0.015;
    const netProceeds = grossProceeds - fee;

    // Credit fiat to account
    await dbAsync.run(
        'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
        [netProceeds, accountId]
    );

    // Create transaction record
    const transId = uuidv4();
    await dbAsync.run(`
        INSERT INTO transactions (id, "accountId", "userId", type, amount, description, status, category, fee)
        VALUES ($1, $2, $3, 'crypto_sell', $4, $5, 'completed', 'Crypto', $6)
    `, [transId, accountId, req.user.id, netProceeds, `Sell ${quantity} ${symbol}`, fee]);

    // Update or Delete holding
    const newQuantity = parseFloat(holding.quantity) - parseFloat(quantity);
    if (newQuantity <= 0.000001) { // Floating point safety
      await dbAsync.run('DELETE FROM "cryptoHoldings" WHERE id = $1', [holding.id]);
    } else {
      await dbAsync.run(
        'UPDATE "cryptoHoldings" SET quantity = $1, "totalValue" = $2 WHERE id = $3',
        [newQuantity, newQuantity * currentPrice, holding.id]
      );
    }

    res.json({
      success: true,
      message: 'Crypto sold successfully',
      data: {
        proceeds: Math.round(netProceeds * 100) / 100,
        fee: Math.round(fee * 100) / 100
      }
    });

  } catch (error) {
    console.error('Sell crypto error:', error);
    res.status(500).json({ success: false, message: 'Error selling crypto' });
  }
});

module.exports = router;