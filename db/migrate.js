import { pool } from "./index.js";

// Creates any tables that may be missing from the DB.
// Safe to run on every startup — all statements use CREATE TABLE IF NOT EXISTS.
const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS custom_commands (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    response TEXT NOT NULL,
    created_by TEXT NOT NULL,
    uses INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT custom_cmds_guild_name_unique UNIQUE (guild_id, name)
);

CREATE TABLE IF NOT EXISTS embed_templates (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    description TEXT,
    color TEXT,
    footer_text TEXT,
    footer_icon_url TEXT,
    thumbnail_url TEXT,
    image_url TEXT,
    author_name TEXT,
    author_icon_url TEXT,
    fields_json TEXT,
    created_by TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT embed_templates_guild_name_unique UNIQUE (guild_id, name)
);

CREATE TABLE IF NOT EXISTS user_timezones (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slowmode_timers (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

export async function runMigrations() {
    try {
        await pool.query(MIGRATIONS);
        console.log("[DB] Migrations applied successfully.");
    } catch (err) {
        console.error("[DB] Migration failed:", err.message);
    }
}
