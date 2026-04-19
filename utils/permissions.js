import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
const premiumCache = new Map();
const FALLBACK_BOT_OWNERS = ["1298631508533313536"];
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
        if (!cached.expiresAt || cached.expiresAt > Date.now())
            return cached.active;
        premiumCache.delete(guildId);
    }
    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    const expiresAt = row?.expiresAt?.getTime() ?? null;
    const active = !!row && (!expiresAt || expiresAt > Date.now());
    premiumCache.set(guildId, { active, expiresAt });
    return active;
}
export function invalidatePremiumCache(guildId) {
    premiumCache.delete(guildId);
}
