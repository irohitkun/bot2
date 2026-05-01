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

- **Added Premium AI Assistant (`/ai`, `%ai`, no-prefix `ai`)** — operators describe an action in plain English and the bot turns it into up to 10 audited Discord actions. Premium-gated via `hasTier(guildId, "premium")`. Every tool call is double-gated: invoker must hold the matching Discord permission, the bot must hold it, role hierarchy must permit it, and per-action ceilings (max 28d timeout, max 100 purge, max 10 actions/prompt) apply. Uses the existing AI provider (Groq/OpenAI) with `AI_ASSISTANT_MODEL` to override the planning model and JSON-mode response_format for reliable parsing.
- **AI Assistant tool set (22 tools)** — moderation: `ban_member`, `kick_member`, `timeout_member`, `untimeout_member`, `warn_member`, `purge_messages`. Channels: `lock_channel`, `unlock_channel`, `set_slowmode`, `create_channel` (text/voice/category/announcement), `delete_channel`, `rename_channel`, `set_channel_topic`. Roles: `add_role`, `remove_role`, `create_role` (no permission grants — security), `delete_role`, `set_nickname`. Server: `send_announcement`, `setup_ticket_panel`. Engagement: `create_giveaway` (posts 🎉 embed + schedules end), `create_poll` (posts embed + reacts with emoji numbers).
- **Features registry (`config/features.json`)** — single source of truth for all bot capabilities with version + changelog. Injected into the AI system prompt so the AI answers "what can you do?" naturally, generates on-brand announcements, and never hallucinates features. `/features` and `%features [category]` print capabilities from the registry.
- **"What can you do?" AI flow** — when the AI returns no actions but has a descriptive summary (e.g. for capability queries), the response is shown as an informational embed rather than an error.
- **AI Assistant approval flow** — when a plan contains destructive actions (`ban_member`, `kick_member`, `purge_messages`, `lock_channel`, `delete_channel`, `delete_role`, `send_announcement`), the bot replies with a preview embed plus **Approve & Run** / **Cancel** buttons instead of executing. Only the original invoker can approve. Plans are held in memory for 5 minutes (auto-expire). Reversible plans still execute immediately. Buttons handled in `events/interactionCreate.js` via custom IDs `aiplan:approve:<token>` / `aiplan:cancel:<token>`.
- **AI Assistant audit log (NEW table `ai_assistant_logs`)** — every AI run is recorded: prompt, planSummary, actions JSON, results JSON, succeeded/failed counts, status (`executed`/`cancelled`/`expired`/`error`). View with `/ailog` (slash) or `%ailog` (prefix) — both Manage Server + premium-gated. Optional filters: `limit` (1–15, default 5) and `user`. Run `npm run db:push` after pulling to create the table.
- Added `/help` with browsable command categories.
- Upgraded `%help` to show only commands that truly support prefix usage.
- Added `/setupcheck` and `%setupcheck` for checking database, intent, and permissions.
- Added `/profile`, `/rank`, `/daily`, `%profile`, `%rank`, and `%daily`.
- Added automatic chat XP for normal member messages with a per-user cooldown.
- Added `%remind <time> <message>` prefix support.
- No-prefix mode now excludes premium management and suspense/fun commands like coinflip, dice, and 8ball.
- Quick utility/community commands respond immediately; suspense commands such as coinflip, dice, and 8ball keep paced responses.
- Premium tiers now display as a compact feature comparison.
- Owner premium listings now include server names when available and saved notes for each premium guild.
- Added `member_stats` database storage for XP, levels, coins, daily streaks, daily claim timestamps, and chat XP cooldown timestamps.
- Fixed `reaction_roles` to use an ID primary key plus a unique message/emoji index.
