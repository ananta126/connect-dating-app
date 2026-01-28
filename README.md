# Connect — An Intentional Dating App

A dating application that prioritizes honesty, emotional safety, and personality over appearance.

## Philosophy

This is a small, intentional app meant to be appreciated, not mass-adopted. We deliberately slow things down to reduce performative behavior, validation-seeking, and superficial judgments. Users should feel psychologically safe, not marketed to.

### Core Principles

- **Neutral avatars first**: Everyone starts with the same neutral avatar. Real photos are revealed gradually based on meaningful interaction.
- **Personality over appearance**: Attraction is a reward for connection, not the entry requirement.
- **Quality over quantity**: Conversation depth, balance, and emotional openness matter more than message volume.
- **No gamification**: No XP bars, points, streaks, or dopamine tricks.
- **Ethical design**: No dark patterns, no addiction loops. Finding a match and leaving the app is success.

## Features

- 🔐 Simple email/password authentication
- 📝 **5-question onboarding** (non-negotiable):
  1. Name (first name or nickname only)
  2. Age (numeric, required)
  3. Gender (inclusive but simple)
  4. Imperfection #1 (behavioral): "When I'm stressed or overwhelmed, I usually…"
  5. Imperfection #2 (relational): "People close to me sometimes wish I was better at…"
- 👤 **Neutral avatar system**: Everyone starts the same. Avatars evolve based on conversation quality.
- 💬 **Conversation-based connections**: No swiping. One profile at a time. Connections form through meaningful dialogue.
- 📊 **Conversation quality tracking**: Low-effort or repetitive messages don't progress avatar evolution.
- 🖼️ **Staged photo reveal**: Photos unlock in stages (blur → partial → full) with mutual consent (coming soon).

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up PostgreSQL Database

Create a new PostgreSQL database:

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE connect_app;

# Exit psql
\q
```

Run the schema to create tables:

```bash
psql -U postgres -d connect_app -f schema.sql
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=connect_app
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Session Secret (generate a random string)
SESSION_SECRET=your_random_session_secret_here

# Server Configuration
PORT=3000
```

### 4. Generate Session Secret

You can generate a random session secret using Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Run the Application

```bash
node app.js
```

The app will be available at `http://localhost:3000`

## Usage

1. **Register**: Create an account with email and password
2. **Onboarding**: Complete the 5 questions honestly. These answers cannot be changed.
3. **Browse**: View one profile at a time. Take your time.
4. **Connect**: Start a conversation when someone feels right.
5. **Conversation**: Quality matters. Meaningful messages help your avatar evolve.
6. **Connection**: As you connect more deeply, learn more about each other.

## Design Decisions

### What We Removed

- ❌ Swiping mechanics
- ❌ Like/Pass buttons
- ❌ Match limits
- ❌ Profile photos on initial view
- ❌ Gender preference filters
- ❌ Gamification elements
- ❌ Forced waiting periods

### What We Added

- ✅ Imperfection questions (private, immutable)
- ✅ Neutral avatars that evolve
- ✅ Conversation quality metrics
- ✅ One-profile-at-a-time browsing
- ✅ Connection-based matching (not appearance-based)
- ✅ Calm, humane UI

## Database Schema

- `users` - User profiles with onboarding data and avatar state
- `connections` - Conversations between users (replaces "matches")
- `messages` - Messages with quality tracking
- `profile_views` - One-at-a-time browsing history
- `compatibility_signals` - Suggestion algorithm data

## Project Structure

```
.
├── app.js          # Main application
├── db.js           # Database connection
├── schema.sql      # PostgreSQL schema
├── package.json    # Dependencies
└── README.md       # This file
```

## Ethical Guardrails

- **No dark patterns**: Every interaction is intentional and transparent
- **No addiction loops**: No notifications that pressure users to return
- **Respectful exits**: Finding a match and leaving is success, not failure
- **Gentle ghosting handling**: Reduces visibility but doesn't punish aggressively
- **Immutable imperfections**: Answers can't be edited to prevent performative behavior

## Technical Notes

- Passwords are hashed with bcrypt
- Session-based authentication (no JWT complexity)
- PostgreSQL for reliable data persistence
- Simple, maintainable code structure
- No external dependencies beyond core libraries

## Troubleshooting

**Database connection error:**
- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure database exists: `psql -U postgres -l`

**Login/Registration errors:**
- Ensure password is at least 6 characters long
- Check that email is in valid format

**Port already in use:**
- Change PORT in `.env` file
- Or kill the process using port 3000

## Development Philosophy

When adding features, ask:
- Does this increase trust or engagement?
- Is this manipulative?
- Does this slow things down or speed them up?
- Would this make someone feel psychologically safe?

If a feature feels manipulative or reduces trust, remove it.