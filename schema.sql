-- PostgreSQL Schema for Intentional Dating App
-- Philosophy: Slow, honest, personality-first connections

-- Users table: Core profile with onboarding data
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    age INTEGER,
    gender VARCHAR(100), -- Inclusive but simple
    imperfection_1 TEXT, -- "When I'm stressed or overwhelmed, I usually..."
    imperfection_2 TEXT, -- "People close to me sometimes wish I was better at..."
    -- Onboarding completion
    onboarding_complete BOOLEAN DEFAULT FALSE,
    -- Avatar state (0.0 to 1.0, starts at 0.0 - neutral)
    avatar_evolution DECIMAL(3,2) DEFAULT 0.00,
    -- Photo system
    photo_path TEXT, -- Original photo (stored securely)
    photo_reveal_level INTEGER DEFAULT 0, -- 0=none, 1=blur, 2=partial, 3=full
    -- User state
    active BOOLEAN DEFAULT TRUE,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Constraints
    CHECK (age IS NULL OR age >= 18),
    CHECK (avatar_evolution >= 0.0 AND avatar_evolution <= 1.0),
    CHECK (photo_reveal_level >= 0 AND photo_reveal_level <= 3)
);

-- Connections table (replaces "matches" - more intentional naming)
-- Connections form naturally through conversation
CREATE TABLE IF NOT EXISTS connections (
    id SERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Connection state
    connection_state VARCHAR(50) DEFAULT 'exploring', -- exploring, connected, archived
    -- Conversation quality metrics
    conversation_quality_score DECIMAL(4,2) DEFAULT 0.00, -- Based on message depth, balance, openness
    message_count INTEGER DEFAULT 0,
    -- Avatar evolution for this connection (mutual)
    mutual_avatar_evolution DECIMAL(3,2) DEFAULT 0.00,
    -- Photo reveal state (requires mutual consent)
    photo_reveal_state VARCHAR(50) DEFAULT 'none', -- none, requested_by_1, requested_by_2, mutual_consent_1, mutual_consent_2, revealed
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP,
    -- Ghosting detection (gentle)
    last_activity_user1 TIMESTAMP,
    last_activity_user2 TIMESTAMP,
    UNIQUE(user1_id, user2_id),
    CHECK (user1_id < user2_id) -- Ensure consistent ordering
);

-- Messages table: Tracks conversation depth and quality
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    connection_id INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    -- Message quality metrics
    message_length INTEGER NOT NULL, -- Character count
    is_repetitive BOOLEAN DEFAULT FALSE, -- Detected repetitive/low-effort
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Profile views table: Track one-at-a-time browsing
-- Used for suggesting profiles based on compatibility
CREATE TABLE IF NOT EXISTS profile_views (
    id SERIAL PRIMARY KEY,
    viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Whether conversation was initiated
    conversation_initiated BOOLEAN DEFAULT FALSE,
    UNIQUE(viewer_id, viewed_id),
    CHECK (viewer_id != viewed_id)
);

-- Compatibility signals: Based on imperfection patterns and conversation
-- This helps suggest who to view next (not forced matching)
CREATE TABLE IF NOT EXISTS compatibility_signals (
    id SERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Compatibility factors (for suggestion algorithm)
    imperfection_compatibility DECIMAL(3,2), -- Similarity/diversity score
    conversation_compatibility DECIMAL(3,2), -- If they have a connection
    suggested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user1_id, user2_id),
    CHECK (user1_id < user2_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active, onboarding_complete);
CREATE INDEX IF NOT EXISTS idx_connections_user1 ON connections(user1_id);
CREATE INDEX IF NOT EXISTS idx_connections_user2 ON connections(user2_id);
CREATE INDEX IF NOT EXISTS idx_connections_state ON connections(connection_state);
CREATE INDEX IF NOT EXISTS idx_messages_connection ON messages(connection_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer ON profile_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed ON profile_views(viewed_id);
CREATE INDEX IF NOT EXISTS idx_compatibility_user1 ON compatibility_signals(user1_id);
CREATE INDEX IF NOT EXISTS idx_compatibility_user2 ON compatibility_signals(user2_id);
