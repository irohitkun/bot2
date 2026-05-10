/**
 * Bot Changelog — add a new entry to the TOP of the array for each release.
 * The latest version is always CHANGELOG[0].
 *
 * sections supported: added, changed, fixed, removed
 * Each section is an array of strings (one line per item).
 */
export const CHANGELOG = [
    {
        version: "2.6",
        title: "Bug Fixes & AI Improvements",
        date: "2026-05-10",
        color: 0xed4245,
        sections: {
            fixed: [
                "**Join-to-Create voice channels** — the bot was not detecting when users joined a hub channel, so temporary VCs were never created. This is now fixed and J2C works as intended.",
                "**`/j2cpanel`** — the panel was saying you must be in a voice channel even when you were already in your temp VC. Fixed — owners can now rename, lock, kick, transfer, and delete their channel.",
                "**`{game}` name template** — if your J2C hub used `{game}` in the name template, it was never replaced with the actual game name. Now works correctly.",
                "**Custom Commands** — `/customcmd add` was crashing with a database error for all servers. The required table was missing and has now been created.",
                "**Embed Templates** — `/embedtemplate create` was crashing on open due to Discord label length limits. Fixed — the popup form now opens correctly.",
                "**AI Assistant** — the AI now knows all J2C commands in detail and will no longer confuse `/j2cpanel` with the ticket panel when you ask about it.",
            ],
        },
    },
    {
        version: "2.5",
        title: "The Big Systems Update",
        date: "2026-05-09",
        color: 0x57f287,
        sections: {
            added: [
                "**Embed Template System** — create named embed templates with `/embedtemplate create`, reuse them in welcome/leave messages and more.",
                "**Leave/Goodbye Messages** — configure a dedicated leave channel and message via `/welcome setleave`. Supports embed templates.",
                "**Verification System** — `/verification setup` posts a button panel; members click to receive a verified role automatically.",
                "**AntiNuke Protection** — detects mass bans/kicks/channel/role deletions and fires configured punishment. Includes whitelist support.",
                "**Anonymous Confession System** — `/confession setup` enables anonymous confessions via modal with optional mod review queue.",
                "**Top.gg Vote Rewards** — `/vote` checks vote status, credits coins + XP, and tracks vote streaks with bonus rewards.",
                "**Interactive Help Menu** — `/help` now shows a live dropdown that updates in-place with all commands for the selected category.",
                "**Rate Limiting** — all slash commands and prefix commands are now rate-limited to prevent abuse.",
                "**Automod Link & Invite Filter** — new `/automod blocklinks` and `/automod blockinvites` subcommands with per-channel bypass support.",
                "**Changelog System** — `/changelog latest` and `/changelog announce` to share version updates with your community.",
            ],
            changed: [
                "**Welcome messages** now support embed templates — set one with `/welcome set embed_template:<name>` instead of plain-text.",
                "**VC logging** — voice state events (join, leave, move) are now logged to the mod-log channel.",
                "**Role & channel logging** — role and channel deletes are now logged to the mod-log channel.",
            ],
            fixed: [
                "**No-prefix bug** — the bot owner could use no-prefix commands in any server even if that server had it disabled.",
                "**Ticket channel names** changed from `ticket-0001` to `ticket-username` format for easier identification.",
            ],
        },
    },
    {
        version: "2.4",
        title: "Top.gg Compliance & Paid Premium",
        date: "2026-04-20",
        color: 0x5865f2,
        sections: {
            added: [
                "**`/premiumadmin activate`** — bot owner can grant Premium to any server. Supports permanent or day-limited grants.",
                "**`/premiumadmin revoke`** — bot owner can immediately remove Premium from any server.",
                "**Paid permanent Premium** — servers can receive lifetime Premium that never expires.",
            ],
            changed: [
                "**Invite link** — updated to use granular permissions instead of Administrator. Top.gg compliant.",
                "**`/premiumadmin`** — refactored into a full subcommand suite: `list`, `activate`, `revoke`.",
            ],
            fixed: [
                "**No-prefix bot owner bypass** — bot owner no longer bypasses no-prefix access controls in other servers.",
            ],
        },
    },
    {
        version: "2.3",
        title: "Self-Service Premium & Vote Rewards",
        date: "2026-04-01",
        color: 0xf1c40f,
        sections: {
            added: [
                "**Vote-Based Premium** — vote for Crux on Top.gg to unlock 12 hours of Premium for your server. Run `/premium vote` after voting.",
                "**30-Day Free Trial** — activate a one-time 30-day trial with `/freetrial`. No bot owner needed.",
                "**Self-service premium** — all premium activation is now controlled by the server owner.",
            ],
            changed: [
                "**`/premium`** — now has a `vote` subcommand. Server owners activate premium themselves.",
                "**`/freetrial`** — now usable by the server owner directly. Trial extended from 7 to 30 days.",
                "**Premium denied messages** — now direct users to vote on Top.gg or use `/freetrial`.",
            ],
            fixed: [
                "**Import crash on startup** — dead imports in antinuke.js and confession.js caused the bot to fail to start.",
                "**Changelog subcommand crash** — permissions were applied to the wrong builder.",
                "**Voice state event crash** — missing export in voiceStateUpdate.js.",
                "**Prefix help crash** — nonexistent function call replaced with correct export.",
                "**`/noprefix`** — guild owner check is now the sole gate as intended.",
            ],
        },
    },
    {
        version: "2.1",
        title: "Stability & Logging",
        date: "2026-03-10",
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
        title: "The Foundation",
        date: "2026-02-15",
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
    }
];

/** Returns the latest version entry */
export const LATEST = CHANGELOG[0];
