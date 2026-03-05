const transporter = require('../utils/transporter');

// Example usage
await transporter.sendMail({
  from: process.env.EMAIL_FROM || 'noreply@securebank.com',
  to: user.email,
  subject: 'Welcome!',
  html: '<h1>Welcome to SecureBank</h1>',
});