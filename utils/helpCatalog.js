export const helpCategories = [
    {
        key: "moderation",
        label: "Moderation",
        commands: [
            ["/ban", "Ban a member"],
            ["/kick", "Kick a member"],
            ["/mute", "Timeout a member"],
            ["/unmute", "Remove a timeout"],
            ["/warn", "Warn a member"],
            ["/warnings", "View member warnings"],
            ["/clearwarn", "Clear warnings"],
            ["/purge", "Bulk delete messages"],
            ["/lock", "Lock a channel"],
            ["/unlock", "Unlock a channel"],
            ["/slowmode", "Set channel slowmode"],
            ["/automod", "Configure automatic moderation"],
        ],
    },
    {
        key: "server",
        label: "Server Tools",
        commands: [
            ["/ticket", "Configure and manage support tickets"],
            ["/reactionroles", "Create reaction role menus"],
            ["/giveaway", "Create and manage giveaways"],
            ["/logs", "Configure server logs"],
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
            ["/avatar", "View a user avatar"],
            ["/banner", "View a user banner"],
            ["/invite", "Get the bot invite link"],
        ],
    },
    {
        key: "utility",
        label: "Utility and Fun",
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
            ["/math", "Calculate expressions"],
            ["/color", "Preview a color"],
            ["/snipe", "Show the last deleted message"],
            ["/8ball", "Ask the magic 8-ball"],
            ["/coinflip", "Flip a coin"],
            ["/dice", "Roll dice"],
        ],
    },
    {
        key: "premium",
        label: "Premium",
        commands: [
            ["/ai", "AI Assistant — describe an action and the bot performs it"],
            ["/ailog", "View recent AI Assistant audit log entries"],
            ["/perks", "View this server's plan and enabled features"],
            ["/premium", "Manage premium access"],
            ["/premiumadmin", "View premium administration tools"],
            ["/freetrial", "Grant a free trial"],
        ],
    },
];

export const prefixCommandNames = new Set([
    "8ball",
    "afk",
    "ai",
    "ailog",
    "avatar",
    "ban",
    "banner",
    "channel",
    "clearwarn",
    "coinflip",
    "daily",
    "dice",
    "giveaway",
    "help",
    "invite",
    "kick",
    "leaderboard",
    "lock",
    "math",
    "mute",
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
    "translate",
    "unban",
    "unlock",
    "unmute",
    "userinfo",
    "warn",
    "warnings",
]);

export const noPrefixBlockedCommandNames = new Set([
    "8ball",
    "coinflip",
    "dice",
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