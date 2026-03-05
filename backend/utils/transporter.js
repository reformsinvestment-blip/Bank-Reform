// transporter.js
const nodemailer = require('nodemailer');

const createTransporter = () => {
  if (process.env.NODE_ENV === 'development') {
    // Development: log emails instead of sending
    return {
      sendMail: async (options) => {
        console.log('📧 Email would be sent (Development Mode)');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('HTML:', options.html);
        return { messageId: 'dev-' + Date.now() };
      },
    };
  }

  // Production: real SMTP
  return nodemailer.createTransport({
    host: process.env.PROD_EMAIL_HOST,
    port: process.env.PROD_EMAIL_PORT || 587,
    secure: process.env.PROD_EMAIL_SECURE === 'true', // true if 465
    auth: {
      user: process.env.PROD_EMAIL_USER,
      pass: process.env.PROD_EMAIL_PASS,
    },
  });
};

const transporter = createTransporter();

module.exports = transporter;