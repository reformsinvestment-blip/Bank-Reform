// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const transferRoutes = require('./routes/transfers');
//const depositRoutes = require('./routes/deposits'); // <-- add this
const loanRoutes = require('./routes/loans');
const cardRoutes = require('./routes/cards');
const depositRoutes = require('./routes/deposits');
const billRoutes = require('./routes/bills');
const cryptoRoutes = require('./routes/crypto');
const statementRoutes = require('./routes/statements');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const notificationRoutes = require('./routes/notifications');

// Import database
const { initDatabase } = require('./database/db');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------
// Security middleware
// ---------------------------
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ---------------------------
// CORS configuration
// ---------------------------
const allowedOrigins = [
  'http://localhost:5173',           // local development
  'https://bank-reform.vercel.app',  // production frontend
  'https://bifrc.org',               // Your main domain
  'https://www.bifrc.org', 
  'https://bifrc-api.onrender.com'
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ---------------------------
// General Rate Limiting
// ---------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// ---------------------------
// Auth Rate Limiter (login/register)
// ---------------------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 50 : 5,
  message: 'Too many authentication attempts, please try again later.',
});

// ---------------------------
// Body parsing middleware
// ---------------------------
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ---------------------------
// Logging middleware
// ---------------------------
app.use(morgan('dev'));

// ---------------------------
// Static files for uploads
// ---------------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------------------------
// Initialize database
// ---------------------------
initDatabase();

// ---------------------------
// API Routes
// ---------------------------
// Auth routes with limiter applied inside authRoutes
app.use('/api/auth', authRoutes); // authLimiter is now handled inside auth.js for login/register

// Other routes
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/deposits', depositRoutes);
//app.use('/api/deposits', depositRoutes); // <-- add this
app.use('/api/bills', billRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationRoutes);

// ---------------------------
// Health check endpoint
// ---------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SecureBank API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ---------------------------
// Root endpoint
// ---------------------------
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to SecureBank API',
    documentation: '/api/docs',
    health: '/api/health',
  });
});

// ---------------------------
// 404 handler
// ---------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ---------------------------
// Global error handler
// ---------------------------
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ---------------------------
// Start server
// ---------------------------
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║           🏦 SecureBank API Server                         ║
║                                                            ║
║   Server running on port: ${PORT}                          ║
║   Environment: ${process.env.NODE_ENV || 'development'}    ║
║   API URL: http://localhost:${PORT}/api                    ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;