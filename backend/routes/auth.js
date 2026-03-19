const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { dbAsync } = require('../database/db');
const { generateToken, authenticate } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// Register
// Register route in backend/routes/auth.js
router.post('/register', [
  body('firstName').trim().isLength({ min: 2 }),
  body('lastName').trim().isLength({ min: 2 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { firstName, lastName, email, password, phone } = req.body;

    // 1. Check if user exists
    const existingUser = await dbAsync.get('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // 2. INSERT user with 'kyc_required' status (NO ACCOUNT CREATED YET)
    await dbAsync.run(`
      INSERT INTO users (id, "firstName", "lastName", email, password, phone, "isVerified", status, "kycStatus")
      VALUES ($1, $2, $3, $4, $5, $6, false, 'kyc_required', 'pending')
    `, [userId, firstName, lastName, email, hashedPassword, phone || null]);

    // Get the created user
    const user = await dbAsync.get('SELECT * FROM users WHERE id = $1', [userId]);
    const token = generateToken(user);

    // 3. Send Email telling them to submit KYC
    try {
      await sendEmail({
        to: email,
        subject: 'Welcome to SecureBank - Action Required',
        template: 'welcome',
        data: { 
          firstName, 
          message: 'Your profile has been created! To open your bank account, please login and upload your identity documents for KYC verification.' 
        }
      });
    } catch (mailErr) {
      console.error("Mail Error:", mailErr);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please complete KYC to open your account.',
      data: { user, token }
    });

  } catch (error) {
    console.error('SERVER CRASH DURING REGISTRATION:', error);
    res.status(500).json({ 
      success: false, 
      message: "Database Error: " + error.message 
    });
  }
});
// Login
// LOGIN ROUTE
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const { email, password } = req.body;

    // Fix 1: Use $1 for Postgres
    const user = await dbAsync.get('SELECT * FROM users WHERE email = $1', [email]);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Fix 2: Check password (user.password is the hash from DB)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Fix 3: PostgreSQL returns actual booleans
    if (user.isActive === false) {
      return res.status(401).json({ success: false, message: 'Account is deactivated' });
    }

    // Fix 4: Update "lastLogin" with quotes and $1
    await dbAsync.run('UPDATE users SET "lastLogin" = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          status: user.status,     
          kycStatus: user.kycStatus
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: "Login Error: " + error.message });
  }
});

// GET CURRENT USER (The "Me" Route)
router.get('/me', authenticate, async (req, res) => {
  try {
    // We MUST use double quotes for CamelCase columns in PostgreSQL
    const user = await dbAsync.get(`
      SELECT id, "firstName", "lastName", email, phone, address, city, country, 
             "postalCode", "dateOfBirth", avatar, role, "isVerified", "createdAt", "lastLogin"
      FROM users WHERE id = $1
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('ME ROUTE CRASH:', error);
    // If this returns 401, you get logged out instantly. 
    // We return 500 here so we can see the real error.
    res.status(500).json({ success: false, message: "Server Error: " + error.message });
  }
});
// Update profile
router.put('/profile', authenticate, [
  body('firstName').optional().trim().isLength({ min: 2 }),
  body('lastName').optional().trim().isLength({ min: 2 }),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('country').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { firstName, lastName, phone, address, city, country, postalCode } = req.body;

    await dbAsync.run(`
      UPDATE users 
      SET firstName = COALESCE(?, firstName),
          lastName = COALESCE(?, lastName),
          phone = COALESCE(?, phone),
          address = COALESCE(?, address),
          city = COALESCE(?, city),
          country = COALESCE(?, country),
          postalCode = COALESCE(?, postalCode),
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [firstName, lastName, phone, address, city, country, postalCode, req.user.id]);

    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [req.user.id]);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
});

// Change password
router.put('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [req.user.id]);

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await dbAsync.run('UPDATE users SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', 
      [hashedPassword, req.user.id]);

    // Send email notification
    await sendEmail({
      to: user.email,
      subject: 'Password Changed - SecureBank',
      template: 'passwordChanged',
      data: { firstName: user.firstName }
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password'
    });
  }
});

// Forgot password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const { email } = req.body;

    const user = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      // Don't reveal if user exists
      return res.json({
        success: true,
        message: 'If an account exists, a password reset link has been sent'
      });
    }

    // Generate reset token (in production, store this in DB with expiry)
    const resetToken = uuidv4();

    // Send reset email
    await sendEmail({
      to: email,
      subject: 'Password Reset - SecureBank',
      template: 'passwordReset',
      data: {
        firstName: user.firstName,
        resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
      }
    });

    res.json({
      success: true,
      message: 'If an account exists, a password reset link has been sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing request'
    });
  }
});

// Logout (client-side token removal, but we can track it)
router.post('/logout', authenticate, async (req, res) => {
  // In a more advanced setup, you might blacklist the token
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;
