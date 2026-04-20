import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { EmbedBuilder } from "discord.js";

const premiumCache = new Map();
const FALLBACK_BOT_OWNERS = ["1298631508533313536"];

// ── Tier definitions ─────────────────────────────────────────────────────────
// Collapsed to 2 tiers: free (0) and premium (1)
// Legacy DB values basic / pro / enterprise are all treated as premium
export const TIERS = {
    free: 0,
    premium: 1,
    // legacy aliases kept for backward compat
    basic: 1,
    pro: 1,
    enterprise: 1,
};

export const TIER_NAMES = ["free", "premium"];

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
        "Custom bot prefix (setprefix)",
        "Server customization (embed color, footer text)",
        "AutoMod (word filter, spam protection, mention limits)",
        "Moderation log channel",
        "No-prefix mode",
        "No-prefix access management",
        "Custom embed builder",
        "Giveaway reroll",
        "Unlimited reaction roles",
        "Multiple ticket panels",
    ],
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
        // Normalise legacy tier names to "premium"
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

// Returns true if the guild has premium (or higher)
export async function hasTier(guildId, requiredTier) {
    const level = await getGuildTierLevel(guildId);
    const required = TIERS[requiredTier] ?? 0;
    return level >= required;
}

export function invalidatePremiumCache(guildId) {
    premiumCache.delete(guildId);
}

// ── Shared premium denial embed ───────────────────────────────────────────────
export function premiumDeniedEmbed(featureName) {
    return new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("⭐ Premium Required")
        .setDescription(
            `**${featureName}** is a Premium feature.\n\n` +
            `Upgrade your server to unlock AutoMod, server logs, custom prefix, embed builder, ` +
            `unlimited reaction roles, giveaway reroll, multiple ticket panels, no-prefix mode, and more.\n\n` +
            `Use \`/premium\` to view plans and activate Premium.`,
        )
        .setFooter({ text: "One plan. All features." });
}
