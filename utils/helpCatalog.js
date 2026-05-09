export const helpCategories = [
    {
        key: "moderation",
        label: "Moderation",
        emoji: "🔨",
        description: "Ban, kick, mute, warn, and manage members",
        commands: [
            ["/ban", "Permanently ban a member"],
            ["/tempban", "Temporarily ban — auto-unbanned after the duration"],
            ["/kick", "Kick a member from the server"],
            ["/mute", "Timeout a member (up to 28 days)"],
            ["/unmute", "Remove a timeout from a member"],
            ["/warn", "Warn a member (stored in DB, DMs the user)"],
            ["/warnings", "View all warnings for a member"],
            ["/clearwarn", "Clear one or all warnings for a member"],
            ["/history", "Full mod history — warnings, temp bans, and notes"],
            ["/note", "Add, list, or delete staff-only notes on a member"],
            ["/purge", "Bulk delete messages (amount / user / until / from)"],
            ["/lock", "Lock a channel (prevent @everyone from sending)"],
            ["/unlock", "Unlock a previously locked channel"],
            ["/massrole", "Add or remove a role from all humans, bots, or everyone"],
            ["/lockdown", "Emergency lockdown — lock or unlock all text channels"],
            ["/slowmode", "Set slowmode on a channel"],
            ["/automod", "Configure automatic moderation (word filter, links, invites, spam)"],
        ],
    },
    {
        key: "server",
        label: "Server Tools",
        emoji: "⚙️",
        description: "Tickets, giveaways, reaction roles, and server setup",
        commands: [
            ["/ticket", "Configure and manage support tickets (+ AI summarize)"],
            ["/reactionroles", "Create interactive reaction role menus"],
            ["/giveaway", "Create and manage giveaways with role/age requirements"],
            ["/logs", "Configure server mod-log channel"],
            ["/welcome", "Configure welcome and goodbye messages"],
            ["/channel", "Create, rename, or delete channels"],
            ["/role", "Create, rename, or delete roles"],
            ["/customize", "Customize bot embed color and footer"],
            ["/setprefix", "Change prefix command prefix"],
            ["/noprefix", "Manage premium no-prefix access"],
            ["/j2c", "⭐ Join-to-Create voice channels — users get instant private VCs"],
            ["/j2cpanel", "⭐ Control panel for your J2C temp channel — rename, lock, kick, transfer"],
            ["/starboard", "⭐ Hall-of-fame channel for starred messages"],
            ["/birthday", "Birthday system with daily announcements"],
            ["/customcmd", "⭐ Create server-specific custom commands"],
            ["/verification", "Button-based member verification gate"],
            ["/antinuke", "Protect your server from mass destructive actions"],
        ],
    },
    {
        key: "info",
        label: "Info",
        emoji: "ℹ️",
        description: "Server info, user info, and bot status",
        commands: [
            ["/help", "Show the interactive help menu"],
            ["/setupcheck", "Check bot setup and permissions"],
            ["/ping", "Check bot latency and API response time"],
            ["/botinfo", "View bot statistics"],
            ["/serverinfo", "View detailed server information"],
            ["/userinfo", "View user profile and account details"],
            ["/avatar", "View a user's avatar in full size"],
            ["/banner", "View a user's banner"],
            ["/invite", "Get the bot invite link"],
        ],
    },
    {
        key: "utility",
        label: "Utility",
        emoji: "🔧",
        description: "Tags, reminders, polls, snipe, and more",
        commands: [
            ["/tag", "Use or manage server tags (staff-triggered canned responses)"],
            ["/sticky", "Stick a message to the bottom of a channel"],
            ["/snipe", "View the last deleted message in a channel"],
            ["/remind", "Set a personal reminder"],
            ["/poll", "Create a reaction-based poll with up to 10 options"],
            ["/translate", "Translate text to any language"],
            ["/afk", "Set an AFK status that notifies people who ping you"],
            ["/embed", "Build and post a custom embed message"],
            ["/schedule", "Schedule a message to be sent later"],
            ["/confession", "Submit an anonymous confession (if enabled)"],
            ["/vote", "Vote for the bot on Top.gg and earn rewards"],
        ],
    },
    {
        key: "community",
        label: "Community",
        emoji: "🏆",
        description: "XP, levels, daily rewards, and leaderboards",
        commands: [
            ["/rank", "View your current XP, level, and rank in the server"],
            ["/leaderboard", "View the top members by XP"],
            ["/daily", "Claim your daily coins reward"],
            ["/profile", "View your full community profile"],
        ],
    },
    {
        key: "premium",
        label: "Premium / AI",
        emoji: "⭐",
        description: "AI assistant, premium features, and subscriptions",
        commands: [
            ["/ai", "⭐ AI Assistant — describe actions in plain English and the bot does them"],
            ["/ailog", "⭐ View the AI assistant audit log"],
            ["/premium", "Manage premium subscriptions (bot owner only)"],
            ["/premiumadmin", "Admin tools for premium management"],
            ["/freetrial", "Activate a free trial of premium features"],
            ["/perks", "View all premium features and perks"],
            ["/features", "Toggle server features on/off"],
        ],
    },
];

export function getHelpCategory(key) {
    return helpCategories.find((c) => c.key === key) ?? null;
}

export function formatCommands(cmds) {
    return cmds.map(([name, desc]) => `\`${name}\` — ${desc}`).join("\n");
}

// Commands that cannot be used in no-prefix mode for security reasons
export const noPrefixBlockedCommandNames = new Set([
    "premium", "premiumadmin", "noprefix", "antinuke",
]);
