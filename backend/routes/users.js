const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { dbAsync: db } = require('../database/db'); 
const { sendEmail } = require('../services/emailService');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------
// 1. GET CURRENT PROFILE (Full Data & Stats)
// ---------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.get(
      `SELECT id, email, "firstName", "lastName", phone, address, city, state, 
              country, "postalCode", "dateOfBirth", "kycStatus", "kycVerifiedAt",
              "twoFactorEnabled", "emailVerified", "phoneVerified", 
              "createdAt", "lastLoginAt", "profileImage", status, role
       FROM users WHERE id = ?`, [req.user.id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const accounts = await db.all(`SELECT * FROM accounts WHERE "userId" = ?`, [req.user.id]);
    const cardData = await db.get('SELECT COUNT(*) as count FROM cards WHERE "userId" = ?', [req.user.id]);
    const unreadData = await db.get('SELECT COUNT(*) as count FROM notifications WHERE "userId" = ? AND "isRead" = false', [req.user.id]);

    res.json({
      success: true,
      user: { ...user, accounts, stats: { cardCount: cardData?.count || 0, unreadNotifications: unreadData?.count || 0 } }
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ---------------------------------------------------------
// 2. UPDATE PROFILE (+ Email Notification)
// ---------------------------------------------------------
router.put('/me', authenticate, async (req, res) => {
  try {
    const updates = req.body;
    const allowedFields = ['firstName', 'lastName', 'phone', 'address', 'city', 'state', 'country', 'postalCode'];
    const fields = [];
    const values = [];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`"${field}" = ?`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) return res.status(400).json({ message: 'No valid fields' });
    values.push(req.user.id);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    // Notification
    await sendEmail({
      to: req.user.email,
      subject: 'Security Alert: Profile Information Updated',
      template: 'welcome',
      data: { firstName: req.user.firstName, message: 'This is a confirmation that your BIFRC profile details have been successfully updated.' }
    });

    res.json({ success: true, message: 'Profile updated' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ---------------------------------------------------------
// 3. UPLOAD AVATAR (+ Email Notification)
// ---------------------------------------------------------
router.post('/me/avatar', authenticate, async (req, res) => {
  try {
    const imageUrl = `/uploads/avatars/${req.user.id}_${Date.now()}.jpg`;
    await db.run('UPDATE users SET "profileImage" = ? WHERE id = ?', [imageUrl, req.user.id]);
    
    await sendEmail({
      to: req.user.email,
      subject: 'Profile Image Changed',
      template: 'welcome',
      data: { firstName: req.user.firstName, message: 'Your BIFRC account profile image was just changed.' }
    });

    res.json({ success: true, imageUrl });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ---------------------------------------------------------
// 4. GET SETTINGS
// ---------------------------------------------------------
router.get('/me/settings', authenticate, async (req, res) => {
  try {
    const settings = await db.get(`SELECT "twoFactorEnabled", "loginNotifications", "transactionNotifications", "marketingEmails", language, timezone, currency FROM users WHERE id = ?`, [req.user.id]);
    res.json({ success: true, settings });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 5. UPDATE SETTINGS (+ Email Notification)
// ---------------------------------------------------------
router.put('/me/settings', authenticate, async (req, res) => {
  try {
    const updates = req.body;
    const allowed = ['twoFactorEnabled', 'loginNotifications', 'transactionNotifications', 'marketingEmails', 'language', 'currency'];
    const fields = [];
    const values = [];

    allowed.forEach(f => {
      if (updates[f] !== undefined) {
        fields.push(`"${f}" = ?`);
        values.push(updates[f]);
      }
    });

    values.push(req.user.id);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    await sendEmail({
      to: req.user.email,
      subject: 'Account Preferences Updated',
      template: 'welcome',
      data: { firstName: req.user.firstName, message: 'Your account settings and notification preferences have been updated.' }
    });

    res.json({ success: true, message: 'Settings saved' });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 6. GET ACTIVITY LOG
// ---------------------------------------------------------
router.get('/me/activity', authenticate, async (req, res) => {
  try {
    const activities = await db.all(`SELECT * FROM "userActivity" WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT 20`, [req.user.id]);
    res.json({ success: true, activities });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 7. REQUEST PASSWORD CHANGE OTP (NEW)
// ---------------------------------------------------------
router.post('/me/password/otp', authenticate, async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await db.run('DELETE FROM "verificationCodes" WHERE email = ? AND type = ?', [req.user.email, 'password_change']);
    await db.run('INSERT INTO "verificationCodes" (id, email, code, type, "expiresAt") VALUES (?, ?, ?, ?, ?)', [uuidv4(), req.user.email, otp, 'password_change', expiresAt]);

    await sendEmail({
      to: req.user.email,
      subject: `Security Code: ${otp}`,
      template: 'welcome',
      data: { firstName: req.user.firstName, message: `Your code to change your password is ${otp}. It expires in 10 minutes.` }
    });

    res.json({ success: true, message: 'OTP sent' });
  } catch (e) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 8. CHANGE PASSWORD WITH OTP (+ Email Notification)
// ---------------------------------------------------------
router.put('/me/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword, code } = req.body;

    const validCode = await db.get('SELECT * FROM "verificationCodes" WHERE email = ? AND code = ? AND type = ?', [req.user.email, code, 'password_change']);
    if (!validCode || new Date() > new Date(validCode.expiresAt)) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    const user = await db.get('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ success: false, message: 'Current password incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    await db.run('DELETE FROM "verificationCodes" WHERE email = ?', [req.user.email]);

    await sendEmail({
      to: req.user.email,
      subject: 'Security Alert: Password Changed Successfully',
      template: 'welcome',
      data: { firstName: req.user.firstName, message: 'Your BIFRC password was changed. If you did not do this, freeze your account immediately.' }
    });

    res.json({ success: true, message: 'Password updated' });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 9. UPDATE 2FA SETTINGS (+ Email Notification)
// ---------------------------------------------------------
router.put('/me/2fa', authenticate, async (req, res) => {
  try {
    const { enabled, method } = req.body;
    await db.run('UPDATE users SET "twoFactorEnabled" = ?, "twoFactorMethod" = ? WHERE id = ?', [enabled, method, req.user.id]);
    
    await sendEmail({
      to: req.user.email,
      subject: '2FA Status Changed',
      template: 'welcome',
      data: { firstName: req.user.firstName, message: `Two-Factor Authentication has been ${enabled ? 'ENABLED' : 'DISABLED'} on your account.` }
    });

    res.json({ success: true, message: '2FA updated' });
  } catch (e) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 10. GET KYC HISTORY
// ---------------------------------------------------------
router.get('/me/kyc', authenticate, async (req, res) => {
  try {
    const kyc = await db.get('SELECT "kycStatus", "kycVerifiedAt", "kycRejectedReason" FROM users WHERE id = ?', [req.user.id]);
    const submissions = await db.all('SELECT * FROM "kycSubmissions" WHERE "userId" = ? ORDER BY "submittedAt" DESC', [req.user.id]);
    res.json({ success: true, kycStatus: kyc.kycStatus, verifiedAt: kyc.kycVerifiedAt, submissions });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 11. SUBMIT KYC (The Synchronized Version)
// ---------------------------------------------------------
router.post('/me/kyc', authenticate, async (req, res) => {
  try {
    const { fullName, docType, docNumber, address, idFront, idBack, selfieImage } = req.body;
    await db.run(`INSERT INTO "kycSubmissions" (id, "userId", "fullName", "documentType", "documentNumber", "idFront", "idBack", "selfieImage", status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, 
      [uuidv4(), req.user.id, fullName, docType, docNumber, idFront, idBack, selfieImage]);

    await db.run('UPDATE users SET "kycStatus" = ?, status = ?, address = ? WHERE id = ?', 
      ['pending_review', 'pending_review', address, req.user.id]);

    await sendEmail({
        to: req.user.email,
        subject: 'Identity Verification Under Review',
        template: 'welcome',
        data: { firstName: req.user.firstName, message: 'Your documents have been received and are now under manual review by our compliance team.' }
    });

    res.json({ success: true, message: 'Submitted' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ---------------------------------------------------------
// 12. ADMIN: GET ALL USERS
// ---------------------------------------------------------
router.get('/', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const users = await db.all('SELECT id, email, "firstName", "lastName", status, "kycStatus", role FROM users ORDER BY "createdAt" DESC');
    res.json({ success: true, users });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 13. ADMIN: GET SINGLE USER
// ---------------------------------------------------------
router.get('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const user = await db.get(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    res.json({ success: true, user });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ---------------------------------------------------------
// 14. ADMIN: UPDATE USER (+ Email Notification)
// ---------------------------------------------------------
router.put('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { status, role } = req.body;
    await db.run('UPDATE users SET status = ?, role = ? WHERE id = ?', [status, role, req.params.id]);
    
    const user = await db.get('SELECT email, "firstName" FROM users WHERE id = ?', [req.params.id]);
    await sendEmail({
      to: user.email,
      subject: 'Official Account Status Update',
      template: 'welcome',
      data: { firstName: user.firstName, message: `Your BIFRC account status has been changed to: ${status.toUpperCase()}.` }
    });

    res.json({ success: true, message: 'User updated' });
  } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;