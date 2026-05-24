/**
 * Bot Changelog — add a new entry to the TOP of the array for each release.
 * The latest version is always CHANGELOG[0].
 *
 * sections supported: added, changed, fixed, removed
 * Each section is an array of strings (one line per item).
 */
export const CHANGELOG = [
    {
        version: "2.10",
        title: "Nuke, Purge Bots & Giveaway Overhaul",
        date: "2026-05-24",
        color: 0x5865f2,
        sections: {
            added: [
                "**Nuke command** — `/nuke` and `%nuke` (alias `%nk`). Before doing anything it shows a small confirmation embed with **Nuke it** and **Cancel** buttons. On confirm it clones the channel — preserving the name, topic, slowmode, category, position, and every permission overwrite — deletes the original, then sends `first` in the clean channel. Your locks stay exactly as they were.",
                "**Purge bots** — new subcommand on both `/purge` and `%purge`. Scans the last 100 messages (or however many you specify) and bulk-deletes anything sent by a bot. Handy for clearing out command spam after a busy session.",
            ],
            changed: [
                "**Giveaway embed redesign** — the prize is now the embed title instead of buried in the description. Ends time, winners count, and hosted by each have their own bolded line. The requirements block (required role, account age, bonus entries) is cleaner too — `☑` for restrictions, `★` for bonus entries. Looks like an actual giveaway now.",
            ],
            fixed: [
                "**`/customize avatar`** — the avatar was being set correctly but the success embed was showing the old avatar URL. Discord's CDN hasn't propagated the change yet by the time the bot re-fetches the member, so the thumbnail was just wrong. It now shows the uploaded image directly and includes a note that it can take up to 60 seconds to visually update in Discord. Also switched the internal API call to the `@me` endpoint which is the correct one for self guild member updates.",
            ],
        },
    },
    {
        version: "2.9",
        title: "Time Tracking, Message Counter & Shortcuts",
        date: "2026-05-22",
        color: 0x5865f2,
        sections: {
            added: [
                "**`/timediff`** — paste any Discord message ID and it tells you exactly when it was sent and how long ago that was. Pass two message IDs and you get the time between them. Also accepts Unix timestamps, relative inputs like `3d ago`, and regular date strings. Prefix version works too: `%timediff` with aliases `%td` and `%tdiff`.",
                "**`/msgcount`** — per-user message tracking with a server leaderboard. Use `/msgcount @user` for a specific person or `/msgcount leaderboard` for the top 10. Also available as `%messages` and `%mc`. Counts start from the first time the bot sees a message — nothing historical gets added.",
                "**More prefix shortcuts** — added `%b` for ban, `%k` for kick, `%m` for mute, `%gw` for giveaway, `%tb` for tempban, `%lb` for leaderboard, and a few others. Full list in `%help`.",
            ],
            fixed: [
                "**Top.gg vote webhook** — incoming votes were being silently dropped instead of registering. They go through correctly now.",
                "**Vote streak logic** — had an edge case that was resetting streaks that should have carried over. More reliable now.",
                "**Giveaway reroll** — the original host could end up winning their own giveaway on a reroll. They're excluded from the pool now.",
            ],
        },
    },
    {
        version: "2.8",
        title: "Quality of Life & Cleanup",
        date: "2026-05-20",
        color: 0x5865f2,
        sections: {
            added: [
                "**`/role members`** — lists everyone who has a specific role, paginated with next/prev buttons. No pings, just names. Also works as `%inrole @role` if you prefer prefix.",
                "**Role toggle shortcut** — `%role <user-id> <role-id>` now just works. Adds the role if they don't have it, removes it if they do. No `add`/`remove` subcommand needed. Raw IDs work fine, mentions work too.",
                "**Prefix aliases** — added some shortcuts: `%to` for timeout, `%rto` to remove it, `%clear` for purge, `%ui` for userinfo, `%si` for serverinfo, `%av` for avatar, `%rename`/`%topic`/`%move` for channel stuff. The dangerous ones (ban, kick, warn) don't have shortcuts intentionally.",
                "**Emoji server support** — set `EMOJI_SERVER_ID` in your env to a server you own, and the bot will load all custom/animated emojis from it on startup. Use `e('name')` anywhere in the code after that.",
            ],
            changed: [
                "**`/customize status`** — was incorrectly showing 'Global default' for server avatar even when you had one set. Force-fetches the member now so it actually reflects reality.",
            ],
            fixed: [
                "**`/warn` on bots** — you could warn the bot. Now you can't. It just says no.",
                "**Sticky messages** — were posting with a `📌 Sticky:` prefix in front of the content. Removed. They just post the content now.",
                "**Server banner** — removed the `/customize banner` subcommand since Discord only allows that for verified/partnered bots. Was just erroring for everyone.",
            ],
        },
    },
    {
        version: "2.7",
        title: "Jail, TempRole, Mass Timeout & Live Voting",
        date: "2026-05-12",
        color: 0x5865f2,
        sections: {
            added: [
                "**Jail System** — `/jail setup` to configure the jail role and channel, then `/jail member` to isolate someone. It strips all their roles and gives them the jail role. Run it again to release them and restore everything.",
                "**TempRole** — `/temprole @user <role> <duration>` gives someone a role for a set time and auto-removes it when it expires. Survives restarts too, so it actually works.",
                "**Mass Timeout** — `/masstimeout` lets you timeout everyone in a role, or all non-bot members at once. Useful when things get chaotic.",
                "**Live vote webhook** — votes from Top.gg now hit the bot instantly. You get a DM the moment your vote registers, with a server picker if you're in multiple servers. Pick one, it gets 16h of premium.",
                "**Vote reminders** — run `/vote remind` once and you'll get a DM when your 12h cooldown is up. Opt out anytime by running it again.",
                "**`%help` dropdown** — prefix help now shows the same interactive category menu as `/help`. Same thing, just prefixed.",
            ],
            changed: [
                "**Vote premium** — bumped from 12h to 16h per vote.",
                "**Expiry DMs** — when your premium is about to expire, the DM now tells you how to renew based on how you activated (vote, trial, admin). Not just a generic message anymore.",
                "**Premium denied messages** — updated to mention the 16h duration and point to `/vote check` properly.",
            ],
        },
    },
    {
        version: "2.6",
        title: "Bug Fixes & AI Improvements",
        date: "2026-05-10",
        color: 0xed4245,
        sections: {
            fixed: [
                "**Join-to-Create** — the bot wasn't detecting when people joined the hub channel, so temp VCs were never being created. That's fixed now.",
                "**`/j2cpanel`** — was telling you to join a voice channel even when you were already in your temp VC. Pretty annoying. Fixed.",
                "**`{game}` template variable** — wasn't being replaced with the actual game name in J2C channel names. Now it is.",
                "**Custom commands** — `/customcmd add` was crashing for everyone because the table it needed didn't exist. Created it, works now.",
                "**Embed templates** — `/embedtemplate create` was crashing when you opened the modal because of a label length issue on Discord's side. Fixed the label lengths.",
                "**AI assistant** — was confusing `/j2cpanel` with the ticket panel. Gave it better context about J2C commands so it stops doing that.",
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
                "**Embed templates** — create named reusable embeds with `/embedtemplate create`. Reference them in welcome/leave messages and more.",
                "**Leave messages** — `/welcome setleave` to set a goodbye message and channel. Works with embed templates.",
                "**Verification gate** — `/verification setup` posts a button in your server. Members click it, they get the role. Simple.",
                "**AntiNuke** — watches for mass bans, kicks, channel/role deletes and takes action. Includes a whitelist so staff don't get caught.",
                "**Confession system** — `/confession setup` lets people submit anonymous messages via a modal. Optional mod review queue if you don't want to fully trust it.",
                "**Vote rewards** — `/vote` now tracks streaks and credits coins + XP when you vote. Streak bonus stacks the longer you keep it going.",
                "**Interactive `/help`** — category dropdown, updates in place. No more walls of text.",
                "**Rate limiting** — all commands have cooldowns now to stop people from hammering them.",
                "**Automod link/invite filter** — two new automod subcommands: `blocklinks` and `blockinvites`. Per-channel bypass support included.",
                "**`/changelog`** — added `latest` and `announce` subcommands so you can share updates with your server.",
            ],
            changed: [
                "**Welcome messages** — now support embed templates. Set one with the template name and it'll use that instead of plain text.",
                "**VC logging** — joins, leaves, and moves now show up in the mod-log channel.",
                "**Role/channel logging** — deletions now get logged too.",
            ],
            fixed: [
                "**No-prefix bypass** — bot owner was accidentally bypassing no-prefix restrictions in other servers. Fixed.",
                "**Ticket channel names** — switched from `ticket-0001` style to `ticket-username` so you can actually tell who opened what.",
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
                "**`/premiumadmin activate`** — grant premium to any server from the bot owner side. Set it to permanent or give it a time limit.",
                "**`/premiumadmin revoke`** — immediately remove premium from a server.",
                "**Lifetime premium** — servers can now have premium that never expires.",
            ],
            changed: [
                "**Invite link** — switched to granular permissions instead of Administrator. Required for Top.gg listing.",
                "**`/premiumadmin`** — properly split into subcommands: `list`, `activate`, `revoke`.",
            ],
            fixed: [
                "**Bot owner no-prefix bypass** — was being applied globally instead of per-server.",
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
                "**Vote for premium** — vote on Top.gg and get 12h of premium for your server. Run `/vote check` after voting to claim it.",
                "**Free trial** — `/freetrial` gives you 30 days of premium, one time per server. No need to contact anyone.",
                "**Self-service activation** — server owners can now activate and manage their own premium without going through the bot owner.",
            ],
            changed: [
                "**`/premium`** — added a `vote` subcommand for server owners.",
                "**`/freetrial`** — extended from 7 days to 30 days. Server owner can run it directly.",
                "**Premium denied messages** — now point you to vote or use `/freetrial` instead of just saying no.",
            ],
            fixed: [
                "**Startup crash** — dead imports in `antinuke.js` and `confession.js` were preventing the bot from starting.",
                "**Changelog crash** — permissions were attached to the wrong builder.",
                "**Voice state crash** — missing export in `voiceStateUpdate.js`.",
                "**Prefix help crash** — was calling a function that didn't exist.",
                "**`/noprefix`** — guild owner check wasn't the actual gate. Now it is.",
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
                "Mod-log channel — bans, kicks, mutes, warns all log to a channel you configure.",
                "Temp-bans — set a duration and the user is unbanned automatically when it's up.",
                "Join-to-Create voice channels — join a hub, get your own private VC. Simple.",
                "Starboard — react enough times and the message shows up in a dedicated channel.",
                "Birthday announcements — set your birthday, get a shoutout on the day.",
            ],
            fixed: [
                "Purge was failing on messages older than 14 days. It now skips those correctly.",
                "Reaction roles were firing when the bot added reactions to set up a menu. Fixed.",
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
                "Full rewrite — Discord.js v14, slash commands, proper structure.",
                "Database — Drizzle ORM + PostgreSQL. Persistent data that actually survives restarts.",
                "Giveaways — create them, set required roles, pick winners, reroll.",
                "AI Assistant (Premium) — tell the bot what to do in plain English. It figures out the command.",
                "Ticket system — panels, threads, transcripts on close.",
                "Reaction roles, AFK system, and custom commands (Premium).",
            ],
        },
    },
];

/** Returns the latest version entry */
export const LATEST = CHANGELOG[0];
