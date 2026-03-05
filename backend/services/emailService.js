const nodemailer = require('nodemailer');
const { dbAsync } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

// Create transporter
const createTransporter = () => {
  // Development mode: no real email sending
  if (process.env.NODE_ENV === 'development') {
    return {
      sendMail: async (options) => {
        console.log('📧 Email would be sent (Development Mode)');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        return { messageId: 'dev-' + Date.now() };
      }
    };
  }

  // Production: real SMTP
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const transporter = createTransporter();

// Email Templates
const templates = {
  welcome: (data) => ({
    subject: 'Welcome to SecureBank!',
    html: `
      <div style="font-family: Arial">
        <h2>Hello ${data.firstName},</h2>
        <p>Welcome to SecureBank. Your account has been created successfully.</p>
      </div>
    `
  }),

  loginNotification: (data) => ({
    subject: 'New Login Detected',
    html: `
      <div style="font-family: Arial">
        <h2>New Login to Your Account</h2>
        <p>Time: ${data.time}</p>
        <p>IP: ${data.ip}</p>
      </div>
    `
  }),

  passwordChanged: (data) => ({
    subject: 'Password Changed',
    html: `
      <div style="font-family: Arial">
        <h2>Hello ${data.firstName},</h2>
        <p>Your SecureBank password was recently changed.</p>
      </div>
    `
  }),

  passwordReset: (data) => ({
    subject: 'Reset Your Password',
    html: `
      <div style="font-family: Arial">
        <h2>Hello ${data.firstName},</h2>
        <a href="${data.resetLink}">Reset Password</a>
      </div>
    `
  }),

  transactionReceipt: (data) => ({
    subject: `Transaction Receipt - ${data.reference}`,
    html: `
      <div style="font-family: Arial">
        <h2>Transaction Receipt</h2>
        <p><strong>Reference:</strong> ${data.reference}</p>
        <p><strong>Amount:</strong> ${data.amountFormatted}</p>
        <p><strong>Description:</strong> ${data.description}</p>
        ${data.recipientName ? `<p><strong>Recipient:</strong> ${data.recipientName}</p>` : ''}
      </div>
    `
  }),

  loanApproved: (data) => ({
    subject: 'Loan Approved',
    html: `
      <div style="font-family: Arial">
        <h2>Hello ${data.firstName}, Your loan has been approved!</h2>
      </div>
    `
  }),

  statementReady: (data) => ({
    subject: 'Your Statement is Ready',
    html: `
      <div style="font-family: Arial">
        <h2>${data.period} Statement Ready</h2>
        <a href="${data.statementUrl}">View Statement</a>
      </div>
    `
  }),
};

// Send Email Function
const sendEmail = async ({ to, subject, template, data, userId }) => {
  try {
    const templateFn = templates[template];
    if (!templateFn) throw new Error(`Template '${template}' not found`);

    const content = templateFn(data);

    const result = await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@securebank.com',
      to,
      subject: content.subject,
      html: content.html
    });

    if (userId) {
      await dbAsync.run(
        `INSERT INTO emailLogs (id, userId, emailType, recipient, subject, body, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, template, to, content.subject, content.html, 'sent']
      );
    }

    console.log(`📧 Email sent to ${to}`);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error('Email Error:', error);

    if (userId) {
      await dbAsync.run(
        `INSERT INTO emailLogs (id, userId, emailType, recipient, subject, body, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, template, to, subject, '', 'failed']
      );
    }

    return { success: false, error: error.message };
  }
};

// Send Receipt Email
const sendTransactionReceipt = async (userId, transaction) => {
  try {
    const user = await dbAsync.get(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) return;

    await sendEmail({
      to: user.email,
      subject: `Transaction Receipt - ${transaction.reference}`,
      template: 'transactionReceipt',
      data: {
        firstName: user.firstName,
        reference: transaction.reference,
        date: new Date(transaction.date).toLocaleString(),
        type: transaction.type,
        amount: transaction.amount,
        amountFormatted: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(transaction.amount)),
        description: transaction.description,
        recipientName: transaction.recipientName,
        status: transaction.status
      },
      userId
    });
  } catch (error) {
    console.error('Transaction Email Error:', error);
  }
};

module.exports = {
  sendEmail,
  sendTransactionReceipt,
  templates
};