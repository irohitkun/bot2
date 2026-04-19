import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";

const premiumCache = new Map();
const FALLBACK_BOT_OWNERS = ["1298631508533313536"];

// ── Tier definitions ─────────────────────────────────────────────────────────
// 0 = free, 1 = basic, 2 = pro, 3 = enterprise
export const TIERS = {
    free: 0,
    basic: 1,
    pro: 2,
    enterprise: 3,
};

export const TIER_NAMES = ["free", "basic", "pro", "enterprise"];

export const TIER_FEATURES = {
    free: [
        "All moderation commands (ban, kick, mute, warn, purge, lock)",
        "Info commands (serverinfo, userinfo, avatar, botinfo, ping)",
        "Fun commands (8ball, coinflip, dice, translate, poll, math)",
        "Ticket system (1 panel)",
        "Reaction roles (up to 5 per server)",
        "Giveaways",
        "Welcome / goodbye messages",
    ],
    basic: [
        "Everything in Free",
        "Custom prefix (setprefix)",
        "Server customization (embed color, footer)",
        "Snipe command",
        "AFK system",
        "Reminders",
        "Reaction roles (up to 20 per server)",
        "Multiple ticket panels",
    ],
    pro: [
        "Everything in Basic",
        "AutoMod (word filter, spam protection, mention limits)",
        "Server logs",
        "No-prefix mode",
        "AI commands (chat, summarize)",
        "Embed builder",
        "Advanced giveaways (reroll support)",
        "Unlimited reaction roles",
    ],
    enterprise: [
        "Everything in Pro",
        "No-prefix access management",
        "Unlimited ticket panels & categories",
        "Priority support",
        "Custom ticket panel branding",
        "Unlimited everything",
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
    premiumCache.set(guildId, { active, expiresAt });
    return active;
}

export async function getGuildTier(guildId) {
    const cached = premiumCache.get(guildId);
    if (cached?.tier && (!cached.expiresAt || cached.expiresAt > Date.now())) return cached.tier;

    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    if (!row) return "free";
    const expiresAt = row.expiresAt?.getTime() ?? null;
    if (expiresAt && expiresAt <= Date.now()) return "free";

    premiumCache.set(guildId, { active: true, expiresAt, tier: row.tier });
    return row.tier;
}

export async function getGuildTierLevel(guildId) {
    const tier = await getGuildTier(guildId);
    return TIERS[tier] ?? 0;
}

// Returns true if the guild meets the minimum required tier
export async function hasTier(guildId, requiredTier) {
    const level = await getGuildTierLevel(guildId);
    const required = TIERS[requiredTier] ?? 0;
    return level >= required;
}

export function invalidatePremiumCache(guildId) {
    premiumCache.delete(guildId);
}
