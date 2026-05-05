import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { EmbedBuilder } from "discord.js";

const premiumCache = new Map();
const FALLBACK_BOT_OWNERS = ["1298631508533313536"];

// ── Tier definitions ─────────────────────────────────────────────────────────
// Only two tiers exist: free and premium. Legacy values like "basic", "pro",
// or "enterprise" are normalized to "premium" wherever they're read.
export const TIERS = {
    free: 0,
    premium: 1,
};

export const TIER_NAMES = ["free", "premium"];

export function normalizeTier(tier) {
    return tier === "free" ? "free" : "premium";
}

export const TIER_FEATURES = {
    free: [
        "All moderation commands (ban, kick, mute, warn, purge, lock, slowmode)",
        "Info commands (serverinfo, userinfo, avatar, banner, botinfo, ping, invite)",
        "Fun commands (8ball, coinflip, dice, translate, poll, math, color)",
        "Community system (rank, daily rewards, XP, profile)",
        "AFK system",
        "Snipe command",
        "Reminders",
        "Basic giveaways (start & end)",
        "Ticket system (1 panel)",
        "Reaction roles (up to 5 per server)",
        "Welcome / goodbye messages",
        "Channel management",
        "Setup check & help",
    ],
    premium: [
        "Everything in Free",
        "AI Assistant — natural-language moderation, channel/role lifecycle, ticket setup, announcements (/ai, %ai)",
        "AI Assistant audit log (/ailog, %ailog)",
        "Custom bot prefix (setprefix)",
        "Server customization (embed color, footer text)",
        "AutoMod (word filter, spam protection, mention limits)",
        "Moderation log channel (logs every ban, kick, mute, warn)",
        "No-prefix mode",
        "No-prefix access management",
        "Custom embed builder",
        "Giveaway reroll",
        "Unlimited reaction roles",
        "Multiple ticket panels",
    ],
};

// ── Feature-specific denial descriptions ─────────────────────────────────────
const FEATURE_DETAILS = {
    "AI Assistant": {
        icon: "🤖",
        pitch: "Describe what you want done in plain English and the bot does it — moderation (ban, kick, timeout, warn, purge), channel/role lifecycle (create, rename, delete, set topic), ticket panel setup, server announcements, and more. Destructive actions show a preview with Approve/Cancel buttons. Every plan is recorded to an audit log queryable with /ailog.",
        perks: [
            "20+ tools: moderation, channel & role lifecycle, ticket panel setup, announcements",
            "Natural-language commands (\"create #announcements with topic 'team news', then post a welcome message\")",
            "Approve/Cancel preview for destructive actions (ban, kick, delete, purge, lock, announce)",
            "Full audit log of every prompt + outcome (/ailog, %ailog)",
            "Respects role hierarchy + per-action Discord permissions",
            "Works via /ai, %ai, and no-prefix mode",
        ],
    },
    "AI Assistant Audit Log": {
        icon: "📜",
        pitch: "Review every AI Assistant run on your server — who asked, what they asked, what the AI planned, and what actually happened.",
        perks: [
            "See the most recent runs with /ailog",
            "Filter by user with /ailog user:@someone",
            "Tracks succeeded/failed action counts and cancelled previews",
        ],
    },
    "AutoMod": {
        icon: "🛡️",
        pitch: "AutoMod watches your server 24/7 — automatically deleting banned words, killing spam, capping mentions and caps abuse, and logging every violation to a private channel.",
        perks: ["Word filter with custom banned words", "Anti-spam (5 messages in 5s)", "Max mention & caps limits", "Dedicated log channel for every violation"],
    },
    "Moderation Logs": {
        icon: "📋",
        pitch: "Every ban, kick, mute, unmute, and warning is silently forwarded to a private log channel — giving your mod team a full audit trail without clogging your main channels.",
        perks: ["Auto-logs ban, kick, mute, unmute, warn", "Rich embeds with moderator, reason & timestamp", "Set any channel as the log destination", "Never lose track of who did what"],
    },
    "Server Customization": {
        icon: "🎨",
        pitch: "Make the bot feel like it belongs to your community. Set your brand's color on every embed, add a custom footer, and even rename the bot just for your server.",
        perks: ["Custom embed color (any hex code)", "Custom footer text on all bot messages", "Bot nickname per server", "Resets cleanly any time"],
    },
    "Custom Prefix": {
        icon: "⌨️",
        pitch: "Tired of the default prefix clashing with another bot? Pick any character(s) as your server's exclusive bot prefix.",
        perks: ["1–5 character prefix of your choice", "Works instantly across all prefix commands", "Persists through bot restarts", "Example: !, ?, $, >>, ..."],
    },
    "Embed Builder": {
        icon: "✍️",
        pitch: "Send beautiful, fully custom embeds directly from a slash command — announcements, rules, pinned info, you name it. Uses your server's custom color by default.",
        perks: ["Custom title & description", "Hex color override per embed", "Send to any channel", "Uses your server's brand color by default"],
    },
    "No-Prefix Mode": {
        icon: "⚡",
        pitch: "Let trusted users run commands without any prefix at all — just type the command name directly. Fine-grained access control by user or role.",
        perks: ["Toggle on/off per server", "Allow specific users or roles", "Server owner always has access", "Works alongside normal prefix commands"],
    },
    "Giveaway Reroll": {
        icon: "🎲",
        pitch: "When a winner doesn't respond or can't claim their prize, just reroll — instantly pick a new winner from the original entry list.",
        perks: ["Reroll after any completed giveaway", "Picks from original 🎉 reaction list", "Announces new winner in the channel", "No limit on rerolls per giveaway"],
    },
    "Reaction Roles (unlimited)": {
        icon: "🎭",
        pitch: "Free servers can set up 5 reaction roles. Premium removes that cap entirely — build full role menus with as many emojis and roles as you need.",
        perks: ["Unlimited reaction roles per server", "Works on any message in any channel", "Stacks with free reaction roles already set up", "Manage with the same /reactionroles commands"],
    },
    "Multiple Ticket Panels": {
        icon: "🎫",
        pitch: "Free servers get one ticket panel. Premium lets you create separate panels for Support, Reports, Appeals, Partnerships — each routing to its own category.",
        perks: ["Unlimited ticket panels", "Each panel has its own name and category", "Custom button labels", "Full transcript system on close"],
    },
};

export function isBotOwner(userId) {
    const owners = [
        ...new Set([
            ...FALLBACK_BOT_OWNERS,
            ...(process.env.BOT_OWNERS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        ]),
    ];
    return owners.includes(userId);
}

/** Alias for isPremiumGuild — used throughout commands */
export const isPremium = (guildId) => isPremiumGuild(guildId);

export async function isPremiumGuild(guildId) {
    const cached = premiumCache.get(guildId);
    if (cached) {
        if (!cached.expiresAt || cached.expiresAt > Date.now()) return cached.active;
        premiumCache.delete(guildId);
    }
    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    const expiresAt = row?.expiresAt?.getTime() ?? null;
    const active = !!row && (!expiresAt || expiresAt > Date.now());
    premiumCache.set(guildId, { active, expiresAt, tier: row?.tier ?? "free" });
    return active;
}

export async function getGuildTier(guildId) {
    const cached = premiumCache.get(guildId);
    if (cached?.tier && (!cached.expiresAt || cached.expiresAt > Date.now())) {
        return cached.tier === "free" ? "free" : "premium";
    }
    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    if (!row) return "free";
    const expiresAt = row.expiresAt?.getTime() ?? null;
    if (expiresAt && expiresAt <= Date.now()) return "free";
    premiumCache.set(guildId, { active: true, expiresAt, tier: row.tier });
    return "premium";
}

export async function getGuildTierLevel(guildId) {
    const tier = await getGuildTier(guildId);
    return TIERS[tier] ?? 0;
}

export async function hasTier(guildId, requiredTier) {
    const level = await getGuildTierLevel(guildId);
    const required = TIERS[requiredTier] ?? 0;
    return level >= required;
}

export function invalidatePremiumCache(guildId) {
    premiumCache.delete(guildId);
}

// ── Premium denial embed ──────────────────────────────────────────────────────
/**
 * Returns a rich, feature-specific embed shown when a non-premium guild tries
 * to use a premium feature.  Makes the upsell feel aspirational rather than
 * like a hard wall.
 *
 * @param {string} featureName — must match a key in FEATURE_DETAILS or a generic embed is returned
 */
export function premiumDeniedEmbed(featureName) {
    const detail = FEATURE_DETAILS[featureName];

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`${detail?.icon ?? "⭐"} ${featureName} — Premium Feature`)
        .setFooter({ text: "Use /premium info to see everything Premium unlocks • /premium status to check your server" });

    if (detail) {
        embed
            .setDescription(
                `${detail.pitch}\n\n` +
                `**What you get:**\n` +
                detail.perks.map((p) => `✦ ${p}`).join("\n")
            )
            .addFields({
                name: "🚀 How to get Premium",
                value: "Contact the bot owner to activate Premium for your server.\nUse `/premium info` to see the full feature list.",
                inline: false,
            });
    } else {
        embed.setDescription(
            `**${featureName}** is a Premium feature.\n\n` +
            `Premium unlocks AutoMod, server logs, custom prefix, embed builder, ` +
            `unlimited reaction roles, giveaway reroll, multiple ticket panels, no-prefix mode, and more.\n\n` +
            `Use \`/premium info\` to learn more and \`/premium status\` to check your server.`
        );
    }

    return embed;
}

// ── Soft upsell tips for free commands ───────────────────────────────────────
/**
 * Returns a short "💡 Premium tip" string to attach as a footer on free
 * command responses — motivates without blocking.
 *
 * Pass a `context` key to get a relevant tip for the command being used.
 * If no context matches, returns a randomly chosen generic tip.
 *
 * @param {"moderation"|"giveaway"|"reaction"|"ticket"|"general"} [context]
 * @returns {string}
 */
export function getPremiumTip(context) {
    const tips = {
        moderation: [
            "💡 Premium automatically logs every ban, kick, mute & warn to a private channel — /premium info",
            "💡 Premium servers can set a custom embed color & footer text — /premium info",
            "💡 AutoMod (Premium) can auto-delete bad words, spam & mention floods — /premium info",
        ],
        giveaway: [
            "💡 Winner unavailable? Premium unlocks Giveaway Reroll — /premium info",
            "💡 Upgrade to Premium to reroll any completed giveaway instantly — /premium info",
        ],
        reaction: [
            "💡 Premium removes the 5 reaction role limit — add as many as you need — /premium info",
        ],
        ticket: [
            "💡 Premium allows multiple ticket panels for Support, Reports, Appeals & more — /premium info",
        ],
        general: [
            "💡 Premium unlocks AutoMod, custom prefix, mod logs & more — /premium info",
            "💡 Customize the bot's colors and footer text with Premium — /premium info",
            "💡 Use /premium info to see everything Premium unlocks for your server",
        ],
    };

    const pool = tips[context] ?? tips.general;
    return pool[Math.floor(Math.random() * pool.length)];
}
