# Discord Bot

## Overview

Node.js Discord bot using JavaScript ES modules, discord.js v14, PostgreSQL, and Drizzle ORM.

## Commands

- `npm install` — install dependencies
- `npm start` — run the bot
- `npm run register` — register slash commands
- `npm run db:push` — push the Drizzle schema to PostgreSQL

## Environment

- `DISCORD_BOT_TOKEN` is required for the bot to log in to Discord.
- `DISCORD_CLIENT_ID` is required to register slash commands.
- `DATABASE_URL` is required for persistence.
- `MESSAGE_CONTENT_INTENT_ENABLED=true` enables prefix commands that read message content.
- AI commands prefer Groq when `GROQ_API_KEY` exists, then OpenAI.

## Recent Upgrades

- Added `/help` with browsable command categories.
- Upgraded `%help` to show only commands that truly support prefix usage.
- Added `/setupcheck` and `%setupcheck` for checking database, intent, and permissions.
- Added `/profile`, `/rank`, `/daily`, `%profile`, `%rank`, and `%daily`.
- Added automatic chat XP for normal member messages with a per-user cooldown.
- Added `%remind <time> <message>` prefix support.
- No-prefix mode now excludes premium management and suspense/fun commands like coinflip, dice, and 8ball.
- Quick utility/community commands respond immediately; suspense commands such as coinflip, dice, and 8ball keep paced responses.
- Premium tiers now display as a compact feature comparison.
- Added `member_stats` database storage for XP, levels, coins, daily streaks, daily claim timestamps, and chat XP cooldown timestamps.
- Fixed `reaction_roles` to use an ID primary key plus a unique message/emoji index.
