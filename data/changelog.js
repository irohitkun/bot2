/**
 * Bot Changelog — add a new entry to the TOP of the array for each release.
 * The latest version is always CHANGELOG[0].
 *
 * sections supported: added, changed, fixed, removed
 * Each section is an array of strings (one line per item).
 */
export const CHANGELOG = [
    {
        version: "2.5",
        title: "The Big Systems Update",
        date: "2026-05-09",
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
        version: "2.4",
        title: "Top.gg Compliance & Paid Premium",
        date: "2026-04-20",
        color: 0x5865f2,
        sections: {
            added: [
                "**`/premiumadmin activate`** — bot owner can now grant Premium to any server manually. Supports permanent (no expiry) for paid customers, or a custom number of days. Includes a `notes` field to log payment details (e.g. UPI transaction ID).",
                "**`/premiumadmin revoke`** — bot owner can immediately remove Premium from any server with an optional reason. Instantly downgrades the server to free tier.",
                "**Paid permanent Premium** — servers can now receive lifetime Premium that never expires, activated via `/premiumadmin activate guild_id:... permanent:true`.",
            ],
            changed: [
                "**Invite link** — updated to use granular permissions instead of Administrator. Now requests only the specific permissions Crux needs (Kick, Ban, Manage Roles, Manage Messages, Timeout, etc.). Top.gg compliant.",
                "**`/premiumadmin`** — refactored from a single list command into a full subcommand suite: `list`, `activate`, `revoke`.",
            ],
            fixed: [
                "**No-prefix bot owner bypass** — removed `isBotOwner` shortcut from `canUseNoPrefix()`. Bot owner no longer bypasses no-prefix access controls in other servers.",
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
                "**Vote-Based Premium** — server owners can unlock Premium for free by voting for Crux on top.gg. One vote = 12 hours of Premium, auto-renewable. Run `/premium vote` after voting to activate instantly.",
                "**30-Day Free Trial** — server owners can activate a one-time 30-day Premium trial themselves with `/freetrial`. No bot owner involvement required.",
                "**Self-service premium** — all premium activation and trial commands are now fully controlled by the server owner. Zero bot owner dependency.",
            ],
            changed: [
                "**`/premium`** — replaced bot-owner-only `activate`/`deactivate`/`list` subcommands with a new `vote` subcommand. Server owners activate premium themselves.",
                "**`/freetrial`** — now usable by the server owner directly in their own server. Trial extended from 7 days to 30 days.",
                "**Premium denied messages** — now tell users to vote on top.gg or use `/freetrial` instead of contacting the bot owner.",
            ],
            fixed: [
                "**Import crash on startup** — removed dead `requireAdmin` imports in `antinuke.js` and `confession.js` that caused the bot to fail to start.",
                "**Changelog subcommand crash** — `setDefaultMemberPermissions` was applied to a subcommand instead of the main command builder.",
                "**Voice state event crash** — `cleanupOrphanedJ2CChannels` was missing from `voiceStateUpdate.js` exports.",
                "**Prefix help crash** — `getPrefixHelpCategories` (nonexistent) replaced with the correct `helpCategories` export.",
                "**`/noprefix`** — removed `isBotOwner` fallback; guild owner check is now the sole gate as intended.",
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
    },
];

/** Returns the latest version entry */
export const LATEST = CHANGELOG[0];
