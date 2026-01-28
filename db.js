// Database connection module
const { Pool } = require('pg');
require('dotenv').config();

// Railway provides DATABASE_URL automatically
let poolConfig;

if (process.env.DATABASE_URL) {
  // Use Railway's connection string
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  
  // Add SSL for production
  if (process.env.NODE_ENV === 'production') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else {
  // Fallback for local development
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    database: process.env.DB_NAME || 'dating_poc',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

const pool = new Pool(poolConfig);

// Logging for pool events
pool.on('connect', () => {
  console.log('[DB] Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  // Don't exit - let the application continue
  // but log the error for monitoring
});

pool.on('remove', () => {
  console.log('[DB] Client removed from pool');
});

// Error handler for query errors
process.on('unhandledRejection', (reason) => {
  console.error('[DB] Unhandled Rejection:', reason);
});

module.exports = pool;


