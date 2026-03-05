const jwt = require('jsonwebtoken');
const { dbAsync } = require('../database/db');

// JWT Configuration - Pulling directly from your Environment Variables
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

/**
 * Generate JWT token for Login/Register
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify JWT token utility
 */
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

/**
 * Authentication middleware
 * This runs on every private route (Dashboard, Accounts, Transfers, etc.)
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // FIX: Using quotes for Postgres columns and "?" for the dbAsync helper
    const user = await dbAsync.get(
      'SELECT id, email, role, "firstName", "lastName", "isActive" FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Postgres returns a real boolean, so we check strictly against false
    if (user.isActive === false) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }
    
    // Attach user to the request object
    req.user = user;
    next();
    
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Invalid session'
    });
  }
};

/**
 * Admin authorization middleware
 */
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  authorizeAdmin,
  JWT_SECRET
};