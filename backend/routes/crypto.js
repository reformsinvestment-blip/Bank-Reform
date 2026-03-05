const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { dbAsync } = require('../database/db');
const { createTransaction } = require('./transactions');

const router = express.Router();

// Mock crypto prices (in production, fetch from an API)
const cryptoPrices = {
  BTC: { price: 52000, change24h: 2.5 },
  ETH: { price: 3200, change24h: 1.8 },
  SOL: { price: 110, change24h: 5.2 },
  ADA: { price: 0.65, change24h: -1.2 },
  DOT: { price: 8.50, change24h: 0.8 }
};

// Get crypto prices
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

// Get user's crypto holdings
router.get('/holdings', authenticate, async (req, res) => {
  try {
    const holdings = await dbAsync.all(`
      SELECT * FROM cryptoHoldings 
      WHERE userId = ?
    `, [req.user.id]);

    // Update current values based on current prices
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

// Buy crypto
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

    // Verify account
    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Get crypto price
    const cryptoPrice = cryptoPrices[symbol]?.price;
    if (!cryptoPrice) {
      return res.status(400).json({ success: false, message: 'Invalid cryptocurrency' });
    }

    // Calculate crypto amount (minus 1.5% fee)
    const fee = amount * 0.015;
    const netAmount = amount - fee;
    const cryptoAmount = netAmount / cryptoPrice;

    if (account.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient funds' });
    }

    // Create transaction for fiat deduction
    await createTransaction({
      userId: req.user.id,
      accountId,
      type: 'crypto_purchase',
      amount: -parseFloat(amount),
      description: `Purchase ${cryptoAmount.toFixed(6)} ${symbol}`,
      category: 'Crypto',
      fee
    });

    // Check if user already has this crypto
    const existingHolding = await dbAsync.get(
      'SELECT * FROM cryptoHoldings WHERE userId = ? AND symbol = ?',
      [req.user.id, symbol]
    );

    if (existingHolding) {
      // Update existing holding
      const newQuantity = existingHolding.quantity + cryptoAmount;
      const newPurchasePrice = ((existingHolding.quantity * existingHolding.purchasePrice) + (cryptoAmount * cryptoPrice)) / newQuantity;
      
      await dbAsync.run(`
        UPDATE cryptoHoldings 
        SET quantity = ?, purchasePrice = ?, totalValue = ?, currentPrice = ?
        WHERE id = ?
      `, [newQuantity, newPurchasePrice, newQuantity * cryptoPrice, cryptoPrice, existingHolding.id]);

    } else {
      // Create new holding
      const holdingId = uuidv4();
      await dbAsync.run(`
        INSERT INTO cryptoHoldings (id, userId, cryptoType, symbol, quantity, purchasePrice, currentPrice, totalValue)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [holdingId, req.user.id, cryptoType, symbol, cryptoAmount, cryptoPrice, cryptoPrice, cryptoAmount * cryptoPrice]);
    }

    const holding = await dbAsync.get(
      'SELECT * FROM cryptoHoldings WHERE userId = ? AND symbol = ?',
      [req.user.id, symbol]
    );

    res.json({
      success: true,
      message: 'Crypto purchased successfully',
      data: {
        holding,
        cryptoAmount: Math.round(cryptoAmount * 1000000) / 1000000,
        fee: Math.round(fee * 100) / 100
      }
    });

  } catch (error) {
    console.error('Buy crypto error:', error);
    res.status(500).json({ success: false, message: 'Error buying crypto' });
  }
});

// Sell crypto
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

    // Verify account
    const account = await dbAsync.get(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [accountId, req.user.id]
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Check holding
    const holding = await dbAsync.get(
      'SELECT * FROM cryptoHoldings WHERE userId = ? AND symbol = ?',
      [req.user.id, symbol]
    );

    if (!holding || holding.quantity < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient crypto balance' });
    }

    // Get current price
    const currentPrice = cryptoPrices[symbol]?.price;
    if (!currentPrice) {
      return res.status(400).json({ success: false, message: 'Invalid cryptocurrency' });
    }

    // Calculate sale proceeds (minus 1.5% fee)
    const grossProceeds = quantity * currentPrice;
    const fee = grossProceeds * 0.015;
    const netProceeds = grossProceeds - fee;

    // Create transaction for fiat credit
    await createTransaction({
      userId: req.user.id,
      accountId,
      type: 'crypto_purchase',
      amount: netProceeds,
      description: `Sell ${quantity} ${symbol}`,
      category: 'Crypto',
      fee
    });

    // Update holding
    const newQuantity = holding.quantity - quantity;
    if (newQuantity <= 0) {
      await dbAsync.run('DELETE FROM cryptoHoldings WHERE id = ?', [holding.id]);
    } else {
      await dbAsync.run(
        'UPDATE cryptoHoldings SET quantity = ?, totalValue = ? WHERE id = ?',
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
