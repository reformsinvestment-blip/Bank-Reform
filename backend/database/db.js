require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');


// Initialize PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase/Cloud hosting
  }
});

/**
 * dbAsync Helper
 * This maintains compatibility with your existing code logic.
 */
const dbAsync = {
  prepareSql: (sql) => {
    let i = 1;
    let fixedSql = sql;

    // 1. Only convert ? to $1, $2 if "?" actually exists in the string
    if (fixedSql.includes('?')) {
      fixedSql = fixedSql.replace(/\?/g, () => `$${i++}`);
    }

    // 2. Convert SQLite dates to Postgres
    fixedSql = fixedSql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
                       .replace(/date\('now'\)/gi, 'CURRENT_DATE');

    // 3. SAFE QUOTING: Only add quotes if the word is NOT already quoted
    const columns = [
      'userId', 'accountId', 'firstName', 'lastName', 'createdAt', 'updatedAt',
      'isVerified', 'isActive', 'lastLogin', 'accountNumber', 'accountType',
      'openedDate', 'dailyLimit', 'currentDailySpend'
    ];

    columns.forEach(col => {
      // This regex looks for the column name but makes sure it doesn't have a " before it
      const regex = new RegExp(`(?<!")\\b${col}\\b(?!")`, 'g');
      fixedSql = fixedSql.replace(regex, `"${col}"`);
    });

    return fixedSql;
  },

  run: async (sql, params = []) => {
    const processedSql = dbAsync.prepareSql(sql);
    // Only add RETURNING id if it's an INSERT and doesn't already have a RETURNING clause
    let finalSql = processedSql;
    if (processedSql.trim().toUpperCase().startsWith('INSERT') && !processedSql.toUpperCase().includes('RETURNING')) {
      finalSql = `${processedSql} RETURNING id`;
    }
    const res = await pool.query(finalSql, params);
    return { id: res.rows[0]?.id || null, changes: res.rowCount };
  },

  get: async (sql, params = []) => {
    const processedSql = dbAsync.prepareSql(sql);
    const res = await pool.query(processedSql, params);
    return res.rows[0];
  },

  all: async (sql, params = []) => {
    const processedSql = dbAsync.prepareSql(sql);
    const res = await pool.query(processedSql, params);
    return res.rows;
  }
};


const initDatabase = async () => {
  try {
    console.log('⏳ Initializing Supabase PostgreSQL Tables...');

    // 1. Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        city TEXT,
        country TEXT,
        "postalCode" TEXT,
        "dateOfBirth" TEXT,
        avatar TEXT,
        role TEXT DEFAULT 'user',
        "isVerified" BOOLEAN DEFAULT FALSE,
        "isActive" BOOLEAN DEFAULT TRUE,
        pin TEXT,
        "accountId" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "lastLogin" TIMESTAMP
      )
    `);

    // 2. Accounts Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "accountNumber" TEXT UNIQUE NOT NULL,
        "accountType" TEXT NOT NULL,
        balance DECIMAL(20, 2) DEFAULT 0,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'active',
        "interestRate" DECIMAL(5, 2),
        "overdraftLimit" DECIMAL(20, 2) DEFAULT 0,
        "openedDate" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Transactions Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        "accountId" TEXT NOT NULL REFERENCES accounts(id),
        "userId" TEXT NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        amount DECIMAL(20, 2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        description TEXT,
        "recipientName" TEXT,
        "recipientAccount" TEXT,
        "recipientBank" TEXT,
        "swiftCode" TEXT,
        iban TEXT,
        status TEXT DEFAULT 'pending',
        category TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reference TEXT UNIQUE,
        "receiptUrl" TEXT,
        "cotCode" TEXT,
        "taxCode" TEXT,
        "imfCode" TEXT,
        fee DECIMAL(20, 2) DEFAULT 0
      )
    `);

    // 4. Cards Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "accountId" TEXT NOT NULL REFERENCES accounts(id),
        "cardNumber" TEXT NOT NULL,
        "cardHolderName" TEXT NOT NULL,
        "cardType" TEXT NOT NULL,
        "expiryDate" TEXT NOT NULL,
        cvv TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        "dailyLimit" DECIMAL(20, 2) DEFAULT 5000,
        "currentMonthSpending" DECIMAL(20, 2) DEFAULT 0,
        "lastFourDigits" TEXT
      )
    `);

    // 5. Loans Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loans (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "loanType" TEXT NOT NULL,
        amount DECIMAL(20, 2) NOT NULL,
        "interestRate" DECIMAL(5, 2) NOT NULL,
        term INTEGER NOT NULL,
        "monthlyPayment" DECIMAL(20, 2) NOT NULL,
        "totalPayable" DECIMAL(20, 2) NOT NULL,
        "remainingAmount" DECIMAL(20, 2) NOT NULL,
        status TEXT DEFAULT 'pending',
        "appliedDate" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "approvedDate" TIMESTAMP,
        "rejectedDate" TIMESTAMP,
        "rejectionReason" TEXT,
        "nextPaymentDate" TIMESTAMP,
        purpose TEXT,
        documents TEXT
      )
    `);

    // 6. Beneficiaries
    await pool.query(`
      CREATE TABLE IF NOT EXISTS beneficiaries (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        "bankName" TEXT NOT NULL,
        "bankAddress" TEXT,
        "swiftCode" TEXT,
        iban TEXT,
        nickname TEXT,
        "addedDate" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "beneficiaryType" TEXT DEFAULT 'local'
      )
    `);

    // 7. Bill Payments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "billPayments" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "billType" TEXT NOT NULL,
        provider TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        amount DECIMAL(20, 2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        "dueDate" TIMESTAMP,
        "paymentDate" TIMESTAMP,
        status TEXT DEFAULT 'pending',
        reference TEXT UNIQUE
      )
    `);

    // 8. Deposits
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deposits (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "accountId" TEXT NOT NULL REFERENCES accounts(id),
        "depositType" TEXT NOT NULL,
        amount DECIMAL(20, 2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'pending',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "cardNumber" TEXT,
        "cardHolderName" TEXT,
        "expiryDate" TEXT,
        "cryptoType" TEXT,
        "cryptoAmount" DECIMAL(20, 8),
        "walletAddress" TEXT,
        "transactionHash" TEXT,
        "checkNumber" TEXT,
        "checkImageFront" TEXT,
        "checkImageBack" TEXT,
        "bankName" TEXT
      )
    `);

    // 9. Crypto Holdings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "cryptoHoldings" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "cryptoType" TEXT NOT NULL,
        symbol TEXT NOT NULL,
        quantity DECIMAL(20, 8) NOT NULL,
        "purchasePrice" DECIMAL(20, 2) NOT NULL,
        "currentPrice" DECIMAL(20, 2) NOT NULL,
        "totalValue" DECIMAL(20, 2) NOT NULL,
        "profitLoss" DECIMAL(20, 2) DEFAULT 0
      )
    `);

    // 10. Notifications
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        category TEXT DEFAULT 'general',
        "isRead" BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "actionUrl" TEXT
      )
    `);

    // 11. Support Tickets
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "supportTickets" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT DEFAULT 'other',
        status TEXT DEFAULT 'open',
        priority TEXT DEFAULT 'medium',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 12. Support Responses
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "supportResponses" (
        id TEXT PRIMARY KEY,
        "ticketId" TEXT NOT NULL REFERENCES "supportTickets"(id),
        "userId" TEXT NOT NULL REFERENCES users(id),
        message TEXT NOT NULL,
        "isStaff" BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 13. Admin Actions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "adminActions" (
        id TEXT PRIMARY KEY,
        "adminId" TEXT NOT NULL REFERENCES users(id),
        "actionType" TEXT NOT NULL,
        "targetUserId" TEXT NOT NULL REFERENCES users(id),
        details TEXT,
        "performedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "ipAddress" TEXT
      )
    `);

    // 14. Email Logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "emailLogs" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "emailType" TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT,
        "sentAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending'
      )
    `);

    // 15. Statements
    await pool.query(`
      CREATE TABLE IF NOT EXISTS statements (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "accountId" TEXT NOT NULL REFERENCES accounts(id),
        "statementRef" TEXT UNIQUE NOT NULL,
        "startDate" DATE NOT NULL,
        "endDate" DATE NOT NULL,
        format TEXT DEFAULT 'pdf',
        "generatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "downloadedAt" TIMESTAMP
      )
    `);

    // 16. Notification Preferences
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "notificationPreferences" (
        id TEXT PRIMARY KEY,
        "userId" TEXT UNIQUE NOT NULL REFERENCES users(id),
        "emailTransactions" BOOLEAN DEFAULT TRUE,
        "emailSecurity" BOOLEAN DEFAULT TRUE,
        "emailMarketing" BOOLEAN DEFAULT FALSE,
        "emailStatements" BOOLEAN DEFAULT TRUE,
        "pushTransactions" BOOLEAN DEFAULT TRUE,
        "pushSecurity" BOOLEAN DEFAULT TRUE,
        "pushMarketing" BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 17. KYC Submissions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "kycSubmissions" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "documentType" TEXT NOT NULL,
        "documentNumber" TEXT NOT NULL,
        "documentImage" TEXT NOT NULL,
        "selfieImage" TEXT,
        status TEXT DEFAULT 'pending',
        "submittedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "reviewedAt" TIMESTAMP,
        "reviewedBy" TEXT,
        "rejectionReason" TEXT
      )
    `);

    // 18. Crypto Transactions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "cryptoTransactions" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "accountId" TEXT NOT NULL REFERENCES accounts(id),
        "cryptoType" TEXT NOT NULL,
        "transactionType" TEXT NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        price DECIMAL(20, 2) NOT NULL,
        "totalValue" DECIMAL(20, 2) NOT NULL,
        fee DECIMAL(20, 2) DEFAULT 0,
        status TEXT DEFAULT 'pending',
        "walletAddress" TEXT,
        "transactionHash" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 19. Scheduled Payments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "scheduledPayments" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id),
        "accountId" TEXT NOT NULL REFERENCES accounts(id),
        "beneficiaryId" TEXT REFERENCES beneficiaries(id),
        amount DECIMAL(20, 2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        frequency TEXT NOT NULL,
        "nextPaymentDate" TIMESTAMP NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_trans_user ON transactions("userId")');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_acc_user ON accounts("userId")');

    console.log('✅ All PostgreSQL tables initialized successfully');
    
    // Seed data
    await seedInitialData();
    
  } catch (error) {
    // UPDATED: Now logging the full error object for better debugging
    console.error('❌ Error initializing PostgreSQL database:', error);
  }
};

const seedInitialData = async () => {
  try {
    const admin = await dbAsync.get("SELECT * FROM users WHERE email = $1", ['admin@securebank.com']);
    
    if (!admin) {
      const adminId = uuidv4();
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(`
        INSERT INTO users (id, "firstName", "lastName", email, password, role, "isVerified")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [adminId, 'Admin', 'User', 'admin@securebank.com', hashedPassword, 'admin', true]);
      console.log('✅ Admin user seeded');
    }

    const demoUser = await dbAsync.get("SELECT * FROM users WHERE email = $1", ['demo@securebank.com']);
    if (!demoUser) {
        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash('demo123', 10);
        await pool.query(`
          INSERT INTO users (id, "firstName", "lastName", email, password, role, "isVerified")
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [userId, 'John', 'Doe', 'demo@securebank.com', hashedPassword, 'user', true]);

        const accId = uuidv4();
        await pool.query(`
          INSERT INTO accounts (id, "userId", "accountNumber", "accountType", balance)
          VALUES ($1, $2, $3, $4, $5)
        `, [accId, userId, 'CHK' + Date.now(), 'checking', 5000.00]);
        console.log('✅ Demo user seeded');
    }
  } catch (error) {
    console.error('❌ Error seeding data:', error);
  }
};

module.exports = {
  pool,
  dbAsync,
  initDatabase
};