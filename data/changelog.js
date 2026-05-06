/**
 * Bot Changelog — add a new entry to the TOP of the array for each release.
 * The latest version is always CHANGELOG[0].
 *
 * sections supported: added, changed, fixed, removed
 * Each section is an array of strings (one line per item).
 */
export const CHANGELOG = [
    {
        version: "2.2",
        date: "2025-05-06",
        title: "The Big Systems Update",
        color: 0x57f287,
        sections: {
            added: [
                "**Embed Template System** — create named embed templates with `/embedtemplate create`, reuse them in welcome/leave messages and more. Supports `{user}`, `{user_avatar}`, `{server}`, `{count}` variables.",
                "**Leave/Goodbye Messages** — configure a dedicated leave channel and message via `/welcome setleave`. Supports embed templates.",
                "**Verification System** — `/verification setup` posts a button panel; members click to receive a verified role automatically.",
                "**AntiNuke Protection** — detects mass bans/kicks/channel/role deletions in a rolling time window and fires configured punishment. Includes whitelist support.",
                "**Anonymous Confession System** — `/confession setup` enables anonymous confessions via modal with optional mod review queue.",
                "**Top.gg Vote Rewards** — `/vote` checks vote status, credits coins + XP, and tracks vote streaks with bonus rewards.",
                "**Interactive Help Menu** — `/help` now shows a live dropdown that updates in-place with all commands for the selected category.",
                "**Rate Limiting** — all slash commands and prefix commands are now rate-limited to prevent abuse.",
                "**Automod Link & Invite Filter** — new `/automod blocklinks` and `/automod blockinvites` subcommands with per-channel bypass support.",
                "**Changelog System** — `/changelog latest` and `/changelog announce` to share version updates with your community.",
            ],
            changed: [
                "**Welcome messages** now support embed templates — set one with `/welcome set embed_template:<name>` instead of using the plain-text message.",
                "**VC logging** — voice state events (join, leave, move) are now logged to the mod-log channel.",
                "**Role & channel logging** — role deletes and channel deletes are now logged to the mod-log channel.",
            ],
            fixed: [
                "**No-prefix bug** — the bot owner could use no-prefix commands in any server even if that server had it disabled. Now the guild must have no-prefix mode enabled first.",
                "**Ticket channel names** changed from `ticket-0001` to `ticket-username` format for easier identification.",
            ],
        },
    },
    {
        version: "2.1",
        date: "2025-04-01",
        title: "Stability & Logging",
        color: 0x5865f2,
        sections: {
            added: [
                "Mod-log channel support for bans, kicks, mutes, warns.",
                "Temp-ban system with automatic unban scheduling.",
                "Join-to-Create (J2C) voice channel hubs.",
                "Starboard — hall-of-fame channel for starred messages.",
                "Birthday system with daily announcements.",
            ],
            fixed: [
                "Purge command now correctly handles bulk-delete limits.",
                "Reaction roles no longer fire on bot reactions.",
            ],
        },
    },
    {
        version: "2.0",
        date: "2025-03-01",
        title: "The Foundation",
        color: 0xfee75c,
        sections: {
            added: [
                "Complete rewrite with Discord.js v14 and slash commands.",
                "Drizzle ORM + PostgreSQL database backend.",
                "Giveaway system with winners, required roles, and bonus entries.",
                "AI Assistant (Premium) — natural-language moderation and server management.",
                "Ticket system with transcript saving.",
                "Reaction roles.",
                "AFK system.",
                "Custom commands (Premium).",
            ],
        },
    },
];

/** Returns the latest version entry */
export const LATEST = CHANGELOG[0];
