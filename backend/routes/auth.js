const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { dbAsync } = require('../database/db');
const { generateToken, authenticate } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// ---------------------------------------------------------
// 1. REGISTRATION STEP 1: Send OTP
// ---------------------------------------------------------
router.post('/register', [
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { email, firstName } = req.body;

    // Check if user exists
    const existingUser = await dbAsync.get('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser) return res.status(400).json({ success: false, message: 'Email already exists' });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 mins expiry

    // Save OTP (Delete old ones first)
    await dbAsync.run('DELETE FROM "verificationCodes" WHERE email = $1 AND type = $2', [email, 'registration']);
    await dbAsync.run(
      'INSERT INTO "verificationCodes" (id, email, code, type, "expiresAt") VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), email, otp, 'registration', expiresAt]
    );

    // Send Email
    await sendEmail({
      to: email,
      subject: `BIFRC Verification Code: ${otp}`,
      template: 'welcome',
      data: { 
        firstName, 
        message: `Your verification code for registration is: ${otp}. This code will expire in 10 minutes. Please enter it on the registration page to continue.` 
      }
    });

    res.json({ success: true, message: 'Verification code sent to your email.' });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// 2. REGISTRATION STEP 2: Verify OTP & Create User
// ---------------------------------------------------------
router.post('/register/verify', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, code } = req.body;

    // Verify OTP
    const validCode = await dbAsync.get(
      'SELECT * FROM "verificationCodes" WHERE email = $1 AND code = $2 AND type = $3', 
      [email, code, 'registration']
    );

    if (!validCode || new Date() > new Date(validCode.expiresAt)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Create User
    await dbAsync.run(`
      INSERT INTO users (id, "firstName", "lastName", email, password, phone, "isVerified", status, "kycStatus")
      VALUES ($1, $2, $3, $4, $5, $6, true, 'kyc_required', 'pending')
    `, [userId, firstName, lastName, email, hashedPassword, phone || null]);

    // Cleanup
    await dbAsync.run('DELETE FROM "verificationCodes" WHERE email = $1', [email]);

    const user = await dbAsync.get('SELECT * FROM users WHERE id = $1', [userId]);
    const token = generateToken(user);

    res.status(201).json({ success: true, message: 'Account verified and created!', data: { user, token } });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// 3. LOGIN
// ---------------------------------------------------------
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await dbAsync.get('SELECT * FROM users WHERE email = $1', [email]);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isActive === false) return res.status(401).json({ success: false, message: 'Account deactivated' });

    await dbAsync.run('UPDATE users SET "lastLogin" = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, status: user.status, kycStatus: user.kycStatus },
        token
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// 4. GET ME
// ---------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await dbAsync.get(`
      SELECT id, "firstName", "lastName", email, phone, address, city, country, 
             "postalCode", "dateOfBirth", avatar, role, "isVerified", "createdAt", "lastLogin", status, "kycStatus"
      FROM users WHERE id = $1
    `, [req.user.id]);

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { user } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// 5. UPDATE PROFILE
// ---------------------------------------------------------
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { firstName, lastName, phone, address, city, country, postalCode } = req.body;
    await dbAsync.run(`
      UPDATE users 
      SET "firstName" = COALESCE($1, "firstName"),
          "lastName" = COALESCE($2, "lastName"),
          phone = COALESCE($3, phone),
          address = COALESCE($4, address),
          city = COALESCE($5, city),
          country = COALESCE($6, country),
          "postalCode" = COALESCE($7, "postalCode"),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [firstName, lastName, phone, address, city, country, postalCode, req.user.id]);

    const user = await dbAsync.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Profile updated successfully', data: { user } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// 6. PASSWORD CHANGE STEP 1: Send OTP
// ---------------------------------------------------------
router.post('/change-password/otp', authenticate, async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await dbAsync.run('DELETE FROM "verificationCodes" WHERE email = $1 AND type = $2', [req.user.email, 'password_change']);
    await dbAsync.run(
      'INSERT INTO "verificationCodes" (id, email, code, type, "expiresAt") VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), req.user.email, otp, 'password_change', expiresAt]
    );

    await sendEmail({
      to: req.user.email,
      subject: 'Security Alert: Password Change Code',
      template: 'welcome',
      data: { 
        firstName: req.user.firstName, 
        message: `You requested to change your password. Your verification code is: ${otp}. If you did not request this, please secure your account immediately.` 
      }
    });

    res.json({ success: true, message: 'Security code sent to your email.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// 7. PASSWORD CHANGE STEP 2: Verify & Update
// ---------------------------------------------------------
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword, code } = req.body;

    // A. Verify OTP
    const validCode = await dbAsync.get(
      'SELECT * FROM "verificationCodes" WHERE email = $1 AND code = $2 AND type = $3', 
      [req.user.email, code, 'password_change']
    );
    if (!validCode || new Date() > new Date(validCode.expiresAt)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired security code.' });
    }

    // B. Verify Current Password
    const user = await dbAsync.get('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ success: false, message: 'Current password incorrect.' });
    }

    // C. Update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await dbAsync.run('UPDATE users SET password = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, req.user.id]);
    await dbAsync.run('DELETE FROM "verificationCodes" WHERE email = $1', [req.user.email]);

    res.json({ success: true, message: 'Password changed successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// 8. FORGOT PASSWORD
// ---------------------------------------------------------
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await dbAsync.get('SELECT id, "firstName" FROM users WHERE email = $1', [email]);
    if (user) {
      const resetToken = uuidv4(); // In production, store this in a 'resets' table
      await sendEmail({
        to: email,
        subject: 'Password Reset Request',
        template: 'passwordReset',
        data: { firstName: user.firstName, resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}` }
      });
    }
    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// 9. LOGOUT
// ---------------------------------------------------------
router.post('/logout', authenticate, async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;