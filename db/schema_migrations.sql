-- Schema migrations: all new tables added in this upgrade
-- Safe to run multiple times: all statements use IF NOT EXISTS

-- AutoMod new columns (add only if missing)
ALTER TABLE automod_settings ADD COLUMN IF NOT EXISTS block_links BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE automod_settings ADD COLUMN IF NOT EXISTS block_invites BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE automod_settings ADD COLUMN IF NOT EXISTS regex_patterns TEXT NOT NULL DEFAULT '';
ALTER TABLE automod_settings ADD COLUMN IF NOT EXISTS bypass_channels TEXT NOT NULL DEFAULT '';

-- Verification system
CREATE TABLE IF NOT EXISTS verification_settings (
    guild_id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    channel_id TEXT,
    role_id TEXT,
    message TEXT NOT NULL DEFAULT 'Click the button below to verify yourself and gain access to the server.',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- AntiNuke
CREATE TABLE IF NOT EXISTS antinuke_settings (
    guild_id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    ban_threshold INTEGER NOT NULL DEFAULT 3,
    kick_threshold INTEGER NOT NULL DEFAULT 3,
    channel_threshold INTEGER NOT NULL DEFAULT 3,
    role_threshold INTEGER NOT NULL DEFAULT 3,
    time_window INTEGER NOT NULL DEFAULT 10,
    action TEXT NOT NULL DEFAULT 'ban',
    log_channel_id TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS antinuke_whitelist (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    added_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
);

-- Confessions
CREATE TABLE IF NOT EXISTS confession_settings (
    guild_id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    channel_id TEXT,
    review_channel_id TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS confessions (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    confession_message_id TEXT,
    review_message_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Top.gg vote records
CREATE TABLE IF NOT EXISTS vote_records (
    user_id TEXT PRIMARY KEY,
    last_voted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    vote_streak INTEGER NOT NULL DEFAULT 0,
    total_votes INTEGER NOT NULL DEFAULT 0
);
