const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const pool = require("./db");

// Logger utility
const logger = {
  info: (msg, data) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, data || ""),
  error: (msg, err) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err?.message || err || ""),
  warn: (msg, data) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, data || "")
};

// Initialize database schema on startup
async function initializeDatabase() {
  try {
    const schemaSQL = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    // Split by semicolon and execute each statement separately
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim().length > 0);
    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes("already exists")) {
          throw err;
        }
      }
    }
    logger.info("Database schema initialized successfully");
  } catch (error) {
    logger.warn("Database initialization note", error.message);
  }
}

// Initialize database when app starts
// initializeDatabase().catch(err => logger.error("Failed to initialize database", err));

const app = express();
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.set("trust proxy", 1); // Trust first proxy (Railway load balancer)

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Security middleware
app.use(helmet()); // Set security headers

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: "Too many login attempts, please try again later",
  skip: (req) => process.env.NODE_ENV !== 'production', // Skip in development
  keyGenerator: (req) => req.ip || req.connection.remoteAddress // Get real IP from proxy
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests per windowMs
  message: "Too many requests, please try again later",
  skip: (req) => process.env.NODE_ENV !== 'production' // Skip in development
});

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadsDir)); // Serve uploaded photos

// Apply general rate limiter to all routes
app.use(generalLimiter);

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  })
);

// Validation helpers
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase()) && email.length <= 255;
}

function validatePassword(password) {
  return password && password.length >= 8 && password.length <= 255;
}

function sanitizeString(str) {
  return String(str).trim().substring(0, 255).replace(/[<>]/g, "");
}

function sanitizeLongText(str) {
  return String(str).trim().substring(0, 500).replace(/[<>]/g, "");
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  res.status(401).redirect("/login");
}

// Helper to get current user with error handling
async function getCurrentUser(req) {
  if (!req.session.userId) return null;
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [
      req.session.userId
    ]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error("Error fetching current user", error);
    return null;
  }
}

// Middleware to check if onboarding is complete
async function isOnboardingComplete(req, res, next) {
  if (req.session.userId) {
    try {
      const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [
        req.session.userId
      ]);
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        if (user.onboarding_complete) {
          req.user = user;
          return next();
        }
      }
    } catch (error) {
      logger.error("Error checking onboarding status", error);
      return res.status(500).send("An error occurred. Please try again.");
    }
    res.redirect("/onboarding/step-1");
  } else {
    res.status(401).redirect("/login");
  }
}

// Calculate conversation quality score
function calculateConversationQuality(messages) {
  if (messages.length === 0) return 0.0;
  
  let totalScore = 0;
  let validMessages = 0;
  
  messages.forEach(msg => {
    const length = msg.message_length || 0;
    const isRepetitive = msg.is_repetitive || false;
    
    if (!isRepetitive && length > 20) {
      const lengthScore = Math.min(length / 100, 0.5);
      totalScore += lengthScore;
      validMessages++;
    }
  });
  
  if (validMessages === 0) return 0.0;
  
  return Math.min(totalScore / validMessages * 2, 1.0);
}

// Calculate avatar evolution based on conversation
function calculateAvatarEvolution(connection) {
  const baseQuality = connection.conversation_quality_score || 0;
  const messageCount = connection.message_count || 0;
  const balance = connection.message_count > 0 ? 0.5 : 0;
  
  const qualityWeight = 0.7;
  const volumeWeight = 0.3;
  const volumeScore = Math.min(messageCount / 20, 1.0);
  
  return Math.min(baseQuality * qualityWeight + volumeScore * volumeWeight, 1.0);
}

// Check if message is repetitive/low-effort
function isRepetitiveMessage(messageText, previousMessages) {
  if (previousMessages.length < 2) return false;
  
  const recentMessages = previousMessages.slice(-5);
  const lowerText = messageText.toLowerCase().trim();
  
  const exactDupes = recentMessages.filter(msg => 
    msg.message_text.toLowerCase().trim() === lowerText
  );
  
  if (messageText.trim().length < 10) return true;
  
  const lowEffortPatterns = [
    /^(hi|hey|hello|sup|yo)$/i,
    /^(ok|okay|k|yep|yeah)$/i,
    /^(\?|\?\!)$/
  ];
  
  if (lowEffortPatterns.some(pattern => pattern.test(lowerText))) {
    return true;
  }
  
  return exactDupes.length > 0;
}

function page(content, additionalStyles = "") {
  return `
  <html>
  <head>
    <title>Connect</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #333;
        line-height: 1.6;
        min-height: 100vh;
        padding: 20px;
      }
      
      .container {
        max-width: 600px;
        margin: 0 auto;
      }
      
      h1 { 
        font-weight: 300;
        font-size: 36px;
        margin-bottom: 30px;
        color: white;
        text-align: center;
        letter-spacing: 1px;
        text-shadow: 0 2px 10px rgba(0,0,0,0.1);
      }
      
      h2 {
        font-weight: 500;
        font-size: 24px;
        margin-bottom: 20px;
        color: #667eea;
        border-bottom: 2px solid #667eea;
        padding-bottom: 10px;
      }
      
      .card { 
        background: white;
        padding: 30px;
        margin: 20px 0;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        backdrop-filter: blur(10px);
        animation: slideUp 0.4s ease-out;
      }
      
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .btn { 
        padding: 14px 28px;
        margin: 10px 0;
        cursor: pointer;
        border-radius: 10px;
        border: none;
        font-size: 16px;
        font-weight: 600;
        transition: all 0.3s ease;
        width: 100%;
        display: block;
        text-align: center;
        text-decoration: none;
        letter-spacing: 0.5px;
      }
      
      .btn:hover { 
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.2);
      }
      
      .btn:active {
        transform: translateY(0);
      }
      
      .btn-primary { 
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .btn-secondary { 
        background: #f0f0f0;
        color: #333;
        border: 2px solid #ddd;
      }
      
      .btn-secondary:hover {
        background: #e8e8e8;
        border-color: #999;
      }
      
      .btn-success { 
        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        color: white;
      }
      
      input, textarea, select { 
        width: 100%;
        padding: 14px;
        margin: 14px 0;
        border: 2px solid #e0e0e0;
        border-radius: 10px;
        font-size: 16px;
        font-family: inherit;
        transition: all 0.3s ease;
      }
      
      input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
      }
      
      textarea {
        min-height: 120px;
        resize: vertical;
      }
      
      label {
        display: block;
        margin-top: 16px;
        margin-bottom: 8px;
        font-weight: 600;
        color: #555;
        letter-spacing: 0.3px;
      }
      
      .error { 
        color: #d32f2f;
        margin: 14px 0;
        padding: 14px;
        background: #ffebee;
        border-left: 4px solid #d32f2f;
        border-radius: 6px;
        font-weight: 500;
      }
      
      .info {
        color: #1976d2;
        margin: 14px 0;
        padding: 14px;
        background: #e3f2fd;
        border-left: 4px solid #1976d2;
        border-radius: 6px;
        font-weight: 500;
      }
      
      .success {
        color: #388e3c;
        margin: 14px 0;
        padding: 14px;
        background: #e8f5e9;
        border-left: 4px solid #388e3c;
        border-radius: 6px;
        font-weight: 500;
      }
      
      .avatar {
        width: 140px;
        height: 140px;
        border-radius: 50%;
        background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
        margin: 30px auto;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 56px;
        color: #999;
        box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        animation: pulse 2s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      .avatar.evolved {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        animation: none;
      }
      
      .user-info { 
        text-align: right;
        margin-bottom: 20px;
        padding: 14px 20px;
        background: white;
        border-radius: 12px;
        font-size: 14px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        font-weight: 500;
      }
      
      .user-info a {
        color: #667eea;
        text-decoration: none;
        font-weight: 600;
        transition: color 0.3s ease;
      }
      
      .user-info a:hover {
        color: #764ba2;
      }
      
      a { 
        color: #667eea;
        text-decoration: none;
        transition: color 0.3s ease;
        font-weight: 500;
      }
      
      a:hover { 
        color: #764ba2;
        text-decoration: underline;
      }
      
      .switch-link { 
        text-align: center;
        margin-top: 24px;
        padding-top: 24px;
        border-top: 2px solid #f0f0f0;
        color: #666;
      }
      
      .switch-link a {
        color: #667eea;
        font-weight: 600;
      }
      
      .question-prompt {
        font-size: 22px;
        margin-bottom: 12px;
        color: #333;
        font-weight: 500;
        line-height: 1.4;
      }
      
      .question-hint {
        font-size: 14px;
        color: #999;
        margin-top: 8px;
        font-style: italic;
      }
      
      .connection-card {
        border: 2px solid #f0f0f0;
        margin: 16px 0;
        padding: 20px;
        border-radius: 12px;
        background: linear-gradient(135deg, #f9f9f9 0%, #ffffff 100%);
        transition: all 0.3s ease;
        cursor: pointer;
      }
      
      .connection-card:hover {
        border-color: #667eea;
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.15);
        transform: translateY(-2px);
      }
      
      .connection-card strong {
        font-size: 18px;
        color: #333;
      }
      
      .message {
        padding: 14px;
        margin: 10px 0;
        border-radius: 10px;
        word-wrap: break-word;
      }
      
      .message-sent {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        margin-left: auto;
        margin-right: 0;
        max-width: 70%;
        border-left: 4px solid #764ba2;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
      }
      
      .message-sent strong {
        color: #fff;
        font-weight: 600;
      }
      
      .message-received {
        background: linear-gradient(135deg, #f8f9fa 0%, #eef1f9 100%);
        color: #333;
        margin-right: auto;
        margin-left: 0;
        max-width: 70%;
        border-left: 4px solid #667eea;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }
      
      .message-received strong {
        color: #667eea;
        font-weight: 600;
      }
      
      .message-female {
        background: linear-gradient(135deg, #ffe0f0 0%, #fff5fb 100%) !important;
        border-left-color: #ff69b4 !important;
        box-shadow: 0 2px 8px rgba(255, 105, 180, 0.1) !important;
        color: #333 !important;
        margin-left: 0 !important;
        margin-right: auto !important;
      }
      
      .message-female strong {
        color: #ff1493 !important;
      }
      
      .message-time {
        font-size: 12px;
        color: #999;
        margin-top: 6px;
      }
      
      .progress-bar {
        width: 100%;
        height: 6px;
        background: #e0e0e0;
        border-radius: 10px;
        margin: 20px 0;
        overflow: hidden;
      }
      
      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        border-radius: 10px;
        transition: width 0.3s ease;
      }
      
      .badge {
        display: inline-block;
        padding: 6px 14px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        margin: 4px;
        letter-spacing: 0.5px;
      }
      
      .profile-stat {
        display: flex;
        justify-content: space-around;
        margin: 20px 0;
        gap: 10px;
      }
      
      .stat-item {
        flex: 1;
        text-align: center;
        padding: 15px;
        background: #f5f5f5;
        border-radius: 10px;
      }
      
      .stat-number {
        font-size: 24px;
        font-weight: 700;
        color: #667eea;
      }
      
      .stat-label {
        font-size: 12px;
        color: #999;
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      ${additionalStyles}
    </style>
  </head>
  <body>
    <div class="container">
      ${content}
    </div>
  </body>
  </html>
  `;
}

// ===== ERROR HANDLER MIDDLEWARE =====
process.on('unhandledRejection', (err) => {
  logger.error("Unhandled Rejection", err);
});

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ===== DATABASE INITIALIZATION ENDPOINT =====
app.get("/api/init-db", async (req, res) => {
  try {
    const schemaSQL = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim().length > 0);
    let created = 0;
    for (const statement of statements) {
      try {
        await pool.query(statement);
        created++;
      } catch (err) {
        if (err.message.includes("already exists")) {
          // Ignore
        } else {
          throw err;
        }
      }
    }
    res.json({ success: true, message: `Database initialized. ${created} statements executed.` });
  } catch (error) {
    logger.error("Database init error", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== AUTHENTICATION ROUTES =====

app.get("/", isAuthenticated, isOnboardingComplete, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).redirect("/login");
    }
    
    const connectionsResult = await pool.query(
      `SELECT c.*, 
        CASE WHEN c.user1_id = $1 THEN u2.name ELSE u1.name END as other_name,
        CASE WHEN c.user1_id = $1 THEN u2.id ELSE u1.id END as other_id
       FROM connections c
       JOIN users u1 ON c.user1_id = u1.id
       JOIN users u2 ON c.user2_id = u2.id
       WHERE (c.user1_id = $1 OR c.user2_id = $1) 
       AND c.connection_state = 'connected'
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT 5`,
      [req.session.userId]
    );
    
    const nextProfile = await getNextProfileToView(req.session.userId);
    
    res.send(page(`
      <div class="user-info">
        ${user.name} | <a href="/logout">Sign out</a>
      </div>
      <h1>Connect</h1>
      ${connectionsResult.rows.length > 0 ? `
        <div class="card">
          <h2>Your conversations</h2>
          ${connectionsResult.rows.map(conn => `
            <div class="connection-card">
              <strong>${conn.other_name}</strong>
              <a href="/connection/${conn.id}" class="btn btn-primary" style="margin-top: 12px;">Continue conversation</a>
            </div>
          `).join("")}
        </div>
      ` : ""}
      
      <div class="card">
        ${nextProfile ? `
          <h2>Someone you might connect with</h2>
          <div class="avatar${nextProfile.avatar_evolution > 0.3 ? ' evolved' : ''}">
            ${nextProfile.avatar_evolution > 0.3 ? '👤' : '○'}
          </div>
          <p style="text-align: center; margin: 20px 0;">
            <strong>${nextProfile.name}</strong>, ${nextProfile.age}
          </p>
          <a href="/profile/${nextProfile.id}" class="btn btn-primary">View profile</a>
          <a href="/skip-profile/${nextProfile.id}" class="btn btn-secondary" style="margin-top: 8px;">Not now</a>
        ` : `
          <p style="text-align: center; color: #888;">
            Take your time. More people will be available as they join.
          </p>
        `}
      </div>
    `));
  } catch (error) {
    logger.error("Error loading home page", error);
    res.status(500).send(page(`
      <div class="card">
        <h2 style="color: #d9534f;">Error</h2>
        <p>An error occurred. Please <a href="/">try again</a>.</p>
      </div>
    `));
  }
});

app.get("/login", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  const error = req.query.error || "";
  res.send(page(`
    <h1>Welcome</h1>
    <div class="card">
      ${error ? `<div class="error">${error}</div>` : ""}
      <form method="post" action="/login">
        <label>Email</label>
        <input type="email" name="email" placeholder="your@email.com" required />
        <label>Password</label>
        <input type="password" name="password" required />
        <button class="btn btn-primary" type="submit">Sign in</button>
      </form>
      <div class="switch-link">
        New here? <a href="/register">Create an account</a>
      </div>
    </div>
  `));
});

app.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).redirect("/login?error=Email and password are required");
    }

    if (!validateEmail(email)) {
      return res.status(400).redirect("/login?error=Invalid email format");
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);

    if (result.rows.length === 0) {
      logger.warn(`Login attempt with non-existent email: ${email}`);
      return res.status(401).redirect("/login?error=Invalid email or password");
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      logger.warn(`Failed login attempt for user: ${user.id}`);
      return res.status(401).redirect("/login?error=Invalid email or password");
    }

    req.session.userId = user.id;
    logger.info(`User ${user.id} logged in successfully`);
    
    if (user.onboarding_complete) {
      res.redirect("/");
    } else {
      res.redirect("/onboarding/step-1");
    }
  } catch (error) {
    logger.error("Login error", error);
    res.status(500).redirect("/login?error=An error occurred. Please try again.");
  }
});

app.get("/register", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  res.send(page(`
    <h1>Create Account</h1>
    <div class="card">
      <form method="post" action="/register">
        <div style="margin-bottom: 20px;">
          <label for="email" style="display: block; font-weight: 600; margin-bottom: 8px;">Email Address</label>
          <input 
            type="email" 
            id="email"
            name="email" 
            placeholder="your@email.com" 
            required
            style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;"
          />
        </div>
        
        <div style="margin-bottom: 20px;">
          <label for="password" style="display: block; font-weight: 600; margin-bottom: 8px;">Password</label>
          <input 
            type="password" 
            id="password"
            name="password" 
            placeholder="At least 8 characters"
            required
            style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;"
          />
          <p style="font-size: 12px; color: #666; margin-top: 6px;">Minimum 8 characters, case-sensitive</p>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label for="password_confirm" style="display: block; font-weight: 600; margin-bottom: 8px;">Confirm Password</label>
          <input 
            type="password" 
            id="password_confirm"
            name="password_confirm" 
            placeholder="Confirm your password"
            required
            style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;"
          />
        </div>
        
        <button class="btn btn-primary" type="submit" style="margin-top: 20px;">Create Account</button>
      </form>
      
      <div style="text-align: center; margin-top: 28px; padding-top: 28px; border-top: 2px solid #f0f0f0; color: #666; font-size: 14px;">
        Already have an account? <a href="/login" style="color: #667eea; text-decoration: none; font-weight: 600;">Sign in</a>
      </div>
    </div>
  `));
});

app.post("/register", async (req, res) => {
  try {
    const { email, password, password_confirm } = req.body;

    if (!email || !password || !password_confirm) {
      return res.status(400).send(page(`
        <div class="card">
          <h2 style="color: #d9534f;">Error</h2>
          <p>Email and password are required</p>
          <a href="/register" class="btn btn-primary">Back</a>
        </div>
      `));
    }

    if (!validateEmail(email)) {
      return res.status(400).send(page(`
        <div class="card">
          <h2 style="color: #d9534f;">Error</h2>
          <p>Invalid email format</p>
          <a href="/register" class="btn btn-primary">Back</a>
        </div>
      `));
    }

    if (!validatePassword(password)) {
      return res.status(400).send(page(`
        <div class="card">
          <h2 style="color: #d9534f;">Error</h2>
          <p>Password must be at least 8 characters long</p>
          <a href="/register" class="btn btn-primary">Back</a>
        </div>
      `));
    }

    if (password !== password_confirm) {
      return res.status(400).send(page(`
        <div class="card">
          <h2 style="color: #d9534f;">Error</h2>
          <p>Passwords do not match</p>
          <a href="/register" class="btn btn-primary">Back</a>
        </div>
      `));
    }

    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      logger.warn(`Registration attempt with existing email: ${email}`);
      return res.status(409).send(page(`
        <div class="card">
          <h2 style="color: #d9534f;">Error</h2>
          <p>Email already registered</p>
          <a href="/login" class="btn btn-primary">Go to login</a>
        </div>
      `));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (
        email,
        password_hash,
        name,
        age,
        gender,
        imperfection_1,
        imperfection_2
      )
      VALUES ($1, $2, NULL, NULL, NULL, NULL, NULL)
      RETURNING id
      `,
      [email.toLowerCase(), hashedPassword]
    );

    req.session.userId = result.rows[0].id;
    logger.info(`New user registered: ${result.rows[0].id}`);

    res.redirect("/onboarding/step-1");
  } catch (error) {
    logger.error("Registration error", error);
    res.status(500).send(page(`
      <div class="card">
        <h2 style="color: #d9534f;">Error</h2>
        <p>An error occurred during registration. Please try again.</p>
        <a href="/register" class="btn btn-primary">Back</a>
      </div>
    `));
  }
});

app.get("/logout", (req, res) => {
  const userId = req.session.userId;
  req.session.destroy((err) => {
    if (err) {
      logger.error("Session destroy error", err);
    } else {
      logger.info(`User ${userId} logged out`);
    }
    res.redirect("/login");
  });
});

// ===== ONBOARDING: 4 STEPS =====

app.get("/onboarding", isAuthenticated, async (req, res) => {
  const user = await getCurrentUser(req);
  if (user && user.onboarding_complete) {
    return res.redirect("/");
  }
  res.redirect("/onboarding/step-1");
});

// Step 1: Name and Age
app.get('/onboarding/step-1', isAuthenticated, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (user && user.onboarding_complete) {
      return res.redirect('/');
    }
    res.render('onboarding-step-1', { error: null });
  } catch (error) {
    logger.error("Error loading onboarding step 1", error);
    res.status(500).render('onboarding-step-1', { error: 'An error occurred. Please refresh and try again.' });
  }
});

app.post('/onboarding/step-1', isAuthenticated, async (req, res) => {
  try {
    const { name, age } = req.body;

    if (!name || !age) {
      return res.status(400).render('onboarding-step-1', { error: 'Name and age are required' });
    }

    const sanitizedName = sanitizeString(name);
    if (sanitizedName.length < 2) {
      return res.status(400).render('onboarding-step-1', { error: 'Name must be at least 2 characters' });
    }

    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
      return res.status(400).render('onboarding-step-1', { error: 'Please enter a valid age (18-120)' });
    }

    await pool.query(
      `UPDATE users SET name = $1, age = $2 WHERE id = $3`,
      [sanitizedName, ageNum, req.session.userId]
    );
    logger.info(`User ${req.session.userId} completed onboarding step 1`);
    res.redirect('/onboarding/step-2');
  } catch (error) {
    logger.error("Error in onboarding step 1", error);
    res.status(500).render('onboarding-step-1', { error: 'An error occurred. Please try again.' });
  }
});

// Step 2: Gender
app.get("/onboarding/step-2", isAuthenticated, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (user && user.onboarding_complete) {
      return res.redirect("/");
    }
    const error = req.query.error || "";
    res.send(page(`
      <div class="card">
        <div class="question-prompt">How do you identify?</div>
        <div class="question-hint">Inclusive and simple</div>
        ${error ? `<div class="error">${error}</div>` : ""}
        <form method="post" action="/onboarding/step-2">
          <input type="text" name="gender" placeholder="e.g., Woman, Man, Non-binary, Agender" required maxlength="100" />
          <button class="btn btn-primary" type="submit">Continue</button>
        </form>
      </div>
    `));
  } catch (error) {
    logger.error("Error loading onboarding step 2", error);
    res.status(500).send(page(`<div class="card"><div class="error">An error occurred</div></div>`));
  }
});

app.post("/onboarding/step-2", isAuthenticated, async (req, res) => {
  try {
    const { gender } = req.body;
    if (!gender || sanitizeString(gender).length === 0) {
      return res.status(400).redirect("/onboarding/step-2?error=Gender is required");
    }
    await pool.query("UPDATE users SET gender = $1 WHERE id = $2", [sanitizeString(gender), req.session.userId]);
    logger.info(`User ${req.session.userId} completed onboarding step 2`);
    res.redirect("/onboarding/step-3");
  } catch (error) {
    logger.error("Error in onboarding step 2", error);
    res.status(500).redirect("/onboarding/step-2?error=An error occurred");
  }
});

// Step 3: Imperfection #1
app.get("/onboarding/step-3", isAuthenticated, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (user && user.onboarding_complete) {
      return res.redirect("/");
    }
    const error = req.query.error || "";
    res.send(page(`
      <div class="card">
        <div class="question-prompt">When I'm stressed or overwhelmed, I usually…</div>
        <div class="question-hint">One sentence, no emojis. Describe behavior or situations, not just feelings.</div>
        ${error ? `<div class="error">${error}</div>` : ""}
        <form method="post" action="/onboarding/step-3">
          <textarea name="imperfection_1" placeholder="Describe what you actually do when stressed..." required maxlength="500"></textarea>
          <button class="btn btn-primary" type="submit">Continue</button>
        </form>
      </div>
    `));
  } catch (error) {
    logger.error("Error loading onboarding step 3", error);
    res.status(500).send(page(`<div class="card"><div class="error">An error occurred</div></div>`));
  }
});

app.post("/onboarding/step-3", isAuthenticated, async (req, res) => {
  try {
    const answer = sanitizeLongText(req.body.imperfection_1);
    
    if (answer.length === 0) {
      return res.status(400).redirect("/onboarding/step-3?error=Please provide an answer");
    }
    
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
    if (emojiRegex.test(answer)) {
      return res.status(400).redirect("/onboarding/step-3?error=No emojis, please. Just words.");
    }
    
    const words = answer.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 4) {
      return res.status(400).redirect("/onboarding/step-3?error=Please describe behavior or situations, not just single words or phrases.");
    }
    
    await pool.query("UPDATE users SET imperfection_1 = $1 WHERE id = $2", [answer, req.session.userId]);
    logger.info(`User ${req.session.userId} completed onboarding step 3`);
    res.redirect("/onboarding/step-4");
  } catch (error) {
    logger.error("Error in onboarding step 3", error);
    res.status(500).redirect("/onboarding/step-3?error=An error occurred");
  }
});

// Step 4: Imperfection #2
app.get("/onboarding/step-4", isAuthenticated, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (user && user.onboarding_complete) {
      return res.redirect("/");
    }
    const error = req.query.error || "";
    res.send(page(`
      <div class="card">
        <div class="question-prompt">People close to me sometimes wish I was better at…</div>
        <div class="question-hint">One sentence, no emojis. Describe behavior or situations.</div>
        ${error ? `<div class="error">${error}</div>` : ""}
        <form method="post" action="/onboarding/step-4">
          <textarea name="imperfection_2" placeholder="What do people notice you could improve on?" required maxlength="500"></textarea>
          <button class="btn btn-primary" type="submit">Complete</button>
        </form>
      </div>
    `));
  } catch (error) {
    logger.error("Error loading onboarding step 4", error);
    res.status(500).send(page(`<div class="card"><div class="error">An error occurred</div></div>`));
  }
});

app.post("/onboarding/step-4", isAuthenticated, async (req, res) => {
  try {
    const answer = sanitizeLongText(req.body.imperfection_2);
    
    if (answer.length === 0) {
      return res.status(400).redirect("/onboarding/step-4?error=Please provide an answer");
    }
    
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
    if (emojiRegex.test(answer)) {
      return res.status(400).redirect("/onboarding/step-4?error=No emojis, please. Just words.");
    }
    
    const words = answer.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 4) {
      return res.status(400).redirect("/onboarding/step-4?error=Please describe behavior or situations, not just single words or phrases.");
    }
    
    await pool.query(
      "UPDATE users SET imperfection_2 = $1, onboarding_complete = TRUE WHERE id = $2",
      [answer, req.session.userId]
    );
    logger.info(`User ${req.session.userId} completed onboarding`);
    res.redirect("/");
  } catch (error) {
    logger.error("Error in onboarding step 4", error);
    res.status(500).redirect("/onboarding/step-4?error=An error occurred");
  }
});

// ===== PROFILE VIEWING =====

async function getNextProfileToView(viewerId) {
  try {
    const result = await pool.query(
      `SELECT u.* 
       FROM users u
       WHERE u.id != $1 
       AND u.onboarding_complete = TRUE
       AND u.active = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM profile_views pv 
         WHERE pv.viewer_id = $1 AND pv.viewed_id = u.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM connections c
         WHERE (c.user1_id = $1 AND c.user2_id = u.id) OR (c.user1_id = u.id AND c.user2_id = $1)
       )
       ORDER BY RANDOM()
       LIMIT 1`,
      [viewerId]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    logger.error("Error getting next profile", error);
    return null;
  }
}

app.get("/profile/:userId", isAuthenticated, isOnboardingComplete, async (req, res) => {
  try {
    const profileUserId = parseInt(req.params.userId, 10);
    const currentUser = await getCurrentUser(req);
    
    if (!currentUser || profileUserId === currentUser.id) {
      return res.status(400).redirect("/");
    }
    
    const profileResult = await pool.query("SELECT * FROM users WHERE id = $1 AND onboarding_complete = TRUE", [profileUserId]);
    if (profileResult.rows.length === 0) {
      return res.status(404).redirect("/");
    }
    
    const profile = profileResult.rows[0];
    
    await pool.query(
      "INSERT INTO profile_views (viewer_id, viewed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [currentUser.id, profileUserId]
    );
    
    const connectionResult = await pool.query(
      `SELECT * FROM connections 
       WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
      [currentUser.id, profileUserId]
    );
    
    const hasConnection = connectionResult.rows.length > 0;
    
    res.send(page(`
      <div class="user-info">
        ${currentUser.name} | <a href="/">Home</a>
      </div>
      <div class="card">
        <div class="avatar${profile.avatar_evolution > 0.3 ? ' evolved' : ''}">
          ${profile.avatar_evolution > 0.3 ? '👤' : '○'}
        </div>
        <h2 style="text-align: center;">${profile.name}, ${profile.age}</h2>
        <p style="text-align: center; color: #888; margin-bottom: 20px;">${profile.gender || 'Not specified'}</p>
        
        ${hasConnection ? `
          <div class="info">You have an active conversation with ${profile.name}</div>
          <a href="/connection/${connectionResult.rows[0].id}" class="btn btn-primary">Continue conversation</a>
        ` : `
          <p style="text-align: center; margin: 30px 0; color: #666;">
            You can start a conversation to learn more about ${profile.name}. 
            The more you connect, the more you'll discover.
          </p>
          <a href="/start-conversation/${profileUserId}" class="btn btn-primary">Start conversation</a>
          <a href="/skip-profile/${profileUserId}" class="btn btn-secondary" style="margin-top: 8px;">Not now</a>
        `}
      </div>
    `));
  } catch (error) {
    logger.error("Error loading profile", error);
    res.status(500).send(page(`
      <div class="card">
        <h2 style="color: #d9534f;">Error</h2>
        <p>An error occurred. Please <a href="/">go back</a>.</p>
      </div>
    `));
  }
});

app.get("/skip-profile/:userId", isAuthenticated, isOnboardingComplete, async (req, res) => {
  try {
    const profileUserId = parseInt(req.params.userId, 10);
    if (isNaN(profileUserId)) {
      return res.status(400).redirect("/");
    }
    res.redirect("/");
  } catch (error) {
    logger.error("Error skipping profile", error);
    res.status(500).redirect("/");
  }
});

app.get("/start-conversation/:userId", isAuthenticated, isOnboardingComplete, async (req, res) => {
  try {
    const otherUserId = parseInt(req.params.userId, 10);
    const currentUser = await getCurrentUser(req);
    
    if (!currentUser || isNaN(otherUserId) || otherUserId === currentUser.id) {
      return res.status(400).redirect("/");
    }
    
    const existingConnection = await pool.query(
      `SELECT * FROM connections 
       WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
      [currentUser.id, otherUserId]
    );
    
    let connectionId;
    
    if (existingConnection.rows.length > 0) {
      connectionId = existingConnection.rows[0].id;
    } else {
      const user1Id = Math.min(currentUser.id, otherUserId);
      const user2Id = Math.max(currentUser.id, otherUserId);
      
      const result = await pool.query(
        "INSERT INTO connections (user1_id, user2_id, connection_state) VALUES ($1, $2, 'exploring') RETURNING id",
        [user1Id, user2Id]
      );
      connectionId = result.rows[0].id;
      
      await pool.query(
        "UPDATE profile_views SET conversation_initiated = TRUE WHERE viewer_id = $1 AND viewed_id = $2",
        [currentUser.id, otherUserId]
      );
      
      logger.info(`Connection created between user ${currentUser.id} and ${otherUserId}`);
    }
    
    res.redirect(`/connection/${connectionId}`);
  } catch (error) {
    logger.error("Error starting conversation", error);
    res.status(500).redirect("/");
  }
});

// ===== CONVERSATIONS =====

app.get("/connection/:connectionId", isAuthenticated, isOnboardingComplete, async (req, res) => {
  try {
    const connectionId = parseInt(req.params.connectionId, 10);
    const currentUser = await getCurrentUser(req);
    
    if (!currentUser || isNaN(connectionId)) {
      return res.status(400).redirect("/");
    }
    
    const connectionResult = await pool.query(
      `SELECT c.*, 
        CASE WHEN c.user1_id = $1 THEN u2.name ELSE u1.name END as other_name,
        CASE WHEN c.user1_id = $1 THEN u2.id ELSE u1.id END as other_id,
        CASE WHEN c.user1_id = $1 THEN u2.age ELSE u1.age END as other_age,
        CASE WHEN c.user1_id = $1 THEN u2.gender ELSE u1.gender END as other_gender
       FROM connections c
       JOIN users u1 ON c.user1_id = u1.id
       JOIN users u2 ON c.user2_id = u2.id
       WHERE c.id = $2 AND (c.user1_id = $1 OR c.user2_id = $1)`,
      [currentUser.id, connectionId]
    );
    
    if (connectionResult.rows.length === 0) {
      return res.status(403).redirect("/");
    }
    
    const connection = connectionResult.rows[0];
    const otherUser = {
      name: connection.other_name,
      id: connection.other_id,
      age: connection.other_age,
      gender: connection.other_gender
    };
    
    const messagesResult = await pool.query(
      `SELECT m.*, u.name as sender_name, u.gender as sender_gender
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.connection_id = $1
       ORDER BY m.created_at ASC`,
      [connectionId]
    );
    
    if (connection.user1_id === currentUser.id) {
      await pool.query("UPDATE connections SET last_activity_user1 = CURRENT_TIMESTAMP WHERE id = $1", [connectionId]);
    } else {
      await pool.query("UPDATE connections SET last_activity_user2 = CURRENT_TIMESTAMP WHERE id = $1", [connectionId]);
    }
    
    const quality = calculateConversationQuality(messagesResult.rows);
    const avatarEvolution = calculateAvatarEvolution({...connection, conversation_quality_score: quality});
    
    await pool.query(
      "UPDATE connections SET conversation_quality_score = $1, mutual_avatar_evolution = $2 WHERE id = $3",
      [quality, avatarEvolution, connectionId]
    );
    
    await pool.query(
      "UPDATE users SET avatar_evolution = GREATEST(avatar_evolution, $1) WHERE id = $2",
      [avatarEvolution, currentUser.id]
    );
    
    res.send(page(`
      <div class="user-info">
        ${currentUser.name} | <a href="/">Home</a>
      </div>
      <div class="card">
        <h2>Conversation with ${otherUser.name}</h2>
        
        <div class="avatar${connection.mutual_avatar_evolution > 0.3 ? ' evolved' : ''}" style="margin: 20px auto;">
          ${connection.mutual_avatar_evolution > 0.3 ? '👤' : '○'}
        </div>
        
        ${connection.mutual_avatar_evolution > 0.5 ? `
          <div class="info" style="text-align: center; margin: 20px 0;">
            Your connection is deepening. As you continue talking, you'll learn more about each other.
          </div>
        ` : ""}
        
        <div style="max-height: 400px; overflow-y: auto; margin: 20px 0; display: flex; flex-direction: column;">
          ${messagesResult.rows.length > 0 ? messagesResult.rows.map(msg => {
            const isSent = msg.sender_id === currentUser.id;
            const isFemaleReceived = msg.sender_gender && msg.sender_gender.toLowerCase().includes('woman') && !isSent;
            let msgClasses = 'message ';
            msgClasses += isSent ? 'message-sent' : 'message-received';
            if (isFemaleReceived) msgClasses += ' message-female';
            return `
            <div class="${msgClasses}">
              <strong>${msg.sender_name}</strong>
              <div style="margin: 6px 0;">${msg.message_text}</div>
              <div class="message-time">${new Date(msg.created_at).toLocaleString()}</div>
            </div>
          `;
          }).join("") : `
            <p style="text-align: center; color: #888; margin: 40px 0;">
              Start the conversation. Take your time. Quality matters more than speed.
            </p>
          `}
        </div>
        
        <form method="post" action="/connection/${connectionId}/message">
          <textarea name="message" placeholder="Type your message..." required></textarea>
          <button class="btn btn-primary" type="submit">Send</button>
        </form>
      </div>
    `));
  } catch (error) {
    logger.error("Error loading connection", error);
    res.status(500).send(page(`
      <div class="card">
        <h2 style="color: #d9534f;">Error</h2>
        <p>An error occurred. Please <a href="/">go back</a>.</p>
      </div>
    `));
  }
});

app.post("/connection/:connectionId/message", isAuthenticated, isOnboardingComplete, async (req, res) => {
  try {
    const connectionId = parseInt(req.params.connectionId, 10);
    const currentUser = await getCurrentUser(req);
    const messageText = sanitizeLongText(req.body.message || "");
    
    if (!currentUser || isNaN(connectionId)) {
      return res.status(400).redirect("/");
    }

    if (messageText.length === 0) {
      return res.status(400).redirect(`/connection/${connectionId}`);
    }

    if (messageText.length > 500) {
      return res.status(400).redirect(`/connection/${connectionId}?error=Message too long`);
    }
    
    const connectionResult = await pool.query(
      "SELECT * FROM connections WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)",
      [connectionId, currentUser.id]
    );
    
    if (connectionResult.rows.length === 0) {
      return res.status(403).redirect("/");
    }
    
    const previousMessages = await pool.query(
      "SELECT * FROM messages WHERE connection_id = $1 ORDER BY created_at DESC LIMIT 10",
      [connectionId]
    );
    
    const isRepetitive = isRepetitiveMessage(messageText, previousMessages.rows);
    
    await pool.query(
      "INSERT INTO messages (connection_id, sender_id, message_text, message_length, is_repetitive) VALUES ($1, $2, $3, $4, $5)",
      [connectionId, currentUser.id, messageText, messageText.length, isRepetitive]
    );
    
    await pool.query(
      "UPDATE connections SET message_count = message_count + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = $1",
      [connectionId]
    );
    
    await pool.query(
      "UPDATE connections SET connection_state = 'connected' WHERE id = $1 AND connection_state = 'exploring'",
      [connectionId]
    );

    logger.info(`Message sent by user ${currentUser.id} in connection ${connectionId}`);
    res.redirect(`/connection/${connectionId}`);
  } catch (error) {
    logger.error("Error posting message", error);
    const connectionId = req.params.connectionId;
    res.status(500).redirect(`/connection/${connectionId}?error=Failed to send message`);
  }
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  logger.error("Unhandled error", err);
  res.status(err.status || 500).send(page(`
    <div class="card">
      <h2 style="color: #d9534f;">Error ${err.status || 500}</h2>
      <p>${err.message || "An unexpected error occurred"}</p>
      <a href="/" class="btn btn-primary">Go home</a>
    </div>
  `));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Connect app running at http://localhost:${PORT}`);
});
