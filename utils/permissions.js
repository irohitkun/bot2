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
    if (premiumCache.has(guildId))
        return premiumCache.get(guildId);
    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    const result = !!row;
    premiumCache.set(guildId, result);
    return result;
}
export function invalidatePremiumCache(guildId) {
    premiumCache.delete(guildId);
}
