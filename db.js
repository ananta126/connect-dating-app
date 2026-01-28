// Database connection module
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost', 
  port: parseInt(process.env.DB_PORT || '5433', 10), // Ensure port is parsed as integer
  database: process.env.DB_NAME || 'dating_poc',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
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


