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
- `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` enable translation commands.

## Structure

- `index.js` — app entry point
- `commands/` — slash commands
- `prefixCommands/` — prefix commands
- `events/` — Discord event handlers
- `utils/` — command loading, registration, permissions, cache helpers
- `db/` — Drizzle database connection and schema
