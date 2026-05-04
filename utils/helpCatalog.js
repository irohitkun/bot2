export const helpCategories = [
    {
        key: "moderation",
        label: "Moderation",
        commands: [
            ["/ban", "Permanently ban a member"],
            ["/tempban", "Temporarily ban — auto-unbanned after the duration"],
            ["/kick", "Kick a member"],
            ["/mute", "Timeout a member (up to 28 days)"],
            ["/unmute", "Remove a timeout"],
            ["/warn", "Warn a member (stored in DB, DMs the user)"],
            ["/warnings", "View all warnings for a member"],
            ["/clearwarn", "Clear one or all warnings"],
            ["/history", "Full mod history — warnings, temp bans, and notes"],
            ["/note", "Add, list, or delete staff-only notes on a member"],
            ["/purge", "Bulk delete messages (amount / user / until / from)"],
            ["/lock", "Lock a channel"],
            ["/unlock", "Unlock a channel"],
            ["/lockdown", "Emergency lockdown — lock/unlock all text channels at once"],
            ["/slowmode", "Set channel slowmode"],
            ["/automod", "Configure automatic moderation (premium)"],
        ],
    },
    {
        key: "server",
        label: "Server Tools",
        commands: [
            ["/ticket", "Configure and manage support tickets (+ AI summarize)"],
            ["/reactionroles", "Create reaction role menus"],
            ["/giveaway", "Create and manage giveaways"],
            ["/logs", "Configure server mod-log channel"],
            ["/welcome", "Configure welcome messages"],
            ["/channel", "Manage channels"],
            ["/role", "Manage roles"],
            ["/customize", "Customize bot embeds"],
            ["/setprefix", "Change prefix command prefix"],
            ["/noprefix", "Manage premium no-prefix access"],
        ],
    },
    {
        key: "info",
        label: "Info",
        commands: [
            ["/help", "Show this help center"],
            ["/setupcheck", "Check bot setup and permissions"],
            ["/ping", "Check bot latency"],
            ["/botinfo", "View bot stats"],
            ["/serverinfo", "View server information"],
            ["/userinfo", "View user information"],
            ["/avatar", "View a user's avatar"],
            ["/banner", "View a user's banner"],
            ["/invite", "Get the bot invite link"],
        ],
    },
    {
        key: "utility",
        label: "Utility",
        commands: [
            ["/profile", "View your community profile"],
            ["/rank", "View your server rank"],
            ["/leaderboard", "View the server XP leaderboard"],
            ["/daily", "Claim daily coins and XP"],
            ["/afk", "Set AFK status"],
            ["/remind", "Create reminders"],
            ["/poll", "Create polls"],
            ["/embed", "Build embeds"],
            ["/translate", "Translate text"],
            ["/snipe", "Show the last deleted message"],
        ],
    },
    {
        key: "premium",
        label: "Premium",
        commands: [
            ["/ai", "AI Assistant — describe an action and the bot performs it (27 tools)"],
            ["/ailog", "View recent AI Assistant audit log entries"],
            ["/features", "Browse everything this bot can do"],
            ["/perks", "View this server's plan and enabled features"],
            ["/premium", "Manage premium access"],
            ["/premiumadmin", "View premium administration tools"],
            ["/freetrial", "Grant a free trial"],
        ],
    },
];

export const prefixCommandNames = new Set([
    "afk",
    "ai",
    "ailog",
    "avatar",
    "ban",
    "banner",
    "channel",
    "clearwarn",
    "daily",
    "features",
    "giveaway",
    "help",
    "history",
    "invite",
    "kick",
    "leaderboard",
    "lock",
    "lockdown",
    "math",
    "mute",
    "note",
    "ping",
    "poll",
    "profile",
    "purge",
    "rank",
    "remind",
    "role",
    "serverinfo",
    "setprefix",
    "setupcheck",
    "slowmode",
    "snipe",
    "tempban",
    "translate",
    "unban",
    "unlock",
    "unmute",
    "userinfo",
    "warn",
    "warnings",
]);

export const noPrefixBlockedCommandNames = new Set([
    "premium",
    "premiumadmin",
    "freetrial",
    "noprefix",
]);

export function getHelpCategory(key) {
    return helpCategories.find((category) => category.key === key);
}

export function formatCommands(commands, prefix = "/") {
    return commands.map(([name, description]) => {
        const commandName = prefix === "/" ? name : `${prefix}${name.slice(1)}`;
        return `\`${commandName}\` — ${description}`;
    }).join("\n");
}

export function getPrefixHelpCategories() {
    return helpCategories
        .map((category) => ({
            ...category,
            commands: category.commands.filter(([name]) => prefixCommandNames.has(name.slice(1))),
        }))
        .filter((category) => category.commands.length > 0);
}
