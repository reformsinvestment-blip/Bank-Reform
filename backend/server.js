const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const hpp = require('hpp'); // Added for security

// Load environment variables
dotenv.config();

// Import database
const { initDatabase } = require('./database/db');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const transferRoutes = require('./routes/transfers');
const loanRoutes = require('./routes/loans');
const cardRoutes = require('./routes/cards');
const depositRoutes = require('./routes/deposits');
const billRoutes = require('./routes/bills');
const cryptoRoutes = require('./routes/crypto');
const statementRoutes = require('./routes/statements');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const notificationRoutes = require('./routes/notifications');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------
// 1. Security Middleware
// ---------------------------
// Helmet protects against various header-based attacks
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for dashboard charts
    crossOriginEmbedderPolicy: false,
}));

// Prevent HTTP Parameter Pollution
app.use(hpp());

// ---------------------------
// 2. CORS configuration (Strict)
// ---------------------------
const allowedOrigins = [
  'http://localhost:5173',           // Local dev
  'https://bank-reform.vercel.app',  // Vercel build
  'https://bifrc.org',               // Main domain
  'https://www.bifrc.org'            // www version
];

app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Security Block: Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---------------------------
// 3. Rate Limiting
// ---------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // More generous for valid users
  message: 'Too many requests from this IP, please try again in 15 minutes.',
});
app.use('/api/', globalLimiter);

// Brute-force protection for Login/Register
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100, // Strict in production
  message: 'Security Alert: Too many auth attempts. IP logged.',
});

// ---------------------------
// 4. Request Parsing
// ---------------------------
// Increased limits for KYC Base64 image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ---------------------------
// 5. App Initialization
// ---------------------------
initDatabase();

// ---------------------------
// 6. API Routes
// ---------------------------
app.use('/api/auth', authLimiter, authRoutes); // Apply auth strict limiter
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationRoutes);

// Static files for avatars/receipts
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', environment: process.env.NODE_ENV, timestamp: new Date() });
});

// ---------------------------
// 7. Error Handling
// ---------------------------
// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Global Exception Handler (Hide stack traces in production)
app.use((err, req, res, next) => {
  console.error(`🚨 [SERVER ERROR]: ${err.message}`);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`
  🏦 BIFRC CORE API ACTIVE
  PORT: ${PORT}
  ENV: ${process.env.NODE_ENV || 'development'}
  ───────────────────────────────────────
  `);
});

module.exports = app;