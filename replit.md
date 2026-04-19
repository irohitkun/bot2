# Discord Bot

## Overview

Single-folder Node.js Discord bot converted from TypeScript to plain JavaScript. The project uses npm only and runs with `node index.js`.

## Stack

- Node.js 24
- npm
- JavaScript ES modules
- discord.js v14
- PostgreSQL with Drizzle ORM

## Commands

- `npm install` — install dependencies
- `node index.js` — run the bot
- `npm start` — run the bot
- `npm run db:push` — push the Drizzle schema to the configured PostgreSQL database

## Environment

- `DISCORD_BOT_TOKEN` is required for the bot to log in to Discord.
- `DATABASE_URL` is required for commands that store server settings, warnings, AFK status, giveaways, reminders, premium status, and automod settings.
- `MESSAGE_CONTENT_INTENT_ENABLED=true` enables prefix commands that read message content.
- AI commands automatically prefer Groq when `GROQ_API_KEY` exists, then fall back to OpenAI. `AI_PROVIDER` is optional and can force `groq` or `openai`.
- For OpenAI, set `AI_INTEGRATIONS_OPENAI_API_KEY` or `OPENAI_API_KEY`; optional `AI_INTEGRATIONS_OPENAI_BASE_URL`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`.
- For Groq, set `GROQ_API_KEY`; optional `GROQ_BASE_URL` and `GROQ_MODEL`.
- `GITHUB_TOKEN` may be used temporarily for pushing code to GitHub if GitHub account connection is not available.

## Structure

- `index.js` — app entry point
- `commands/` — slash commands
- `prefixCommands/` — prefix commands
- `events/` — Discord event handlers
- `utils/` — command loading, registration, permissions, cache helpers
- `db/` — Drizzle database connection and schema

## Premium No-Prefix Access

- No-prefix mode is a premium server feature managed with `/noprefix`.
- Only the server owner or bot owner can manage no-prefix settings and access.
- When no-prefix mode is enabled, the server owner always has access; other members must be added directly or have an allowed role.
- The `no_prefix_access` table stores allowed users and roles.
- `/premium activate` supports optional duration values like `7d`, `2w`, `1m`, `1y`, or `permanent`; expired premium guilds are treated as inactive.
