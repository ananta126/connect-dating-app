// Database connection module
const { Pool } = require('pg');
require('dotenv').config();

// Railway provides DATABASE_URL automatically, use it if available
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD}@${process.env.DB_HOST || 'localhost'}:${parseInt(process.env.DB_PORT || '5433', 10)}/${process.env.DB_NAME || 'dating_poc'}`,
  // Connection pool settings
  max: 20,                              // Max connections in pool
  idleTimeoutMillis: 30000,             // Close idle connections after 30s
  connectionTimeoutMillis: 5000,        // Timeout for acquiring connection
});

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


