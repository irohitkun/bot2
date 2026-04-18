import { db, guildSettingsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
const DEFAULT_PREFIX = "%";
const prefixCache = new Map();
const noPrefixCache = new Map();
export async function getPrefix(guildId) {
    if (prefixCache.has(guildId))
        return prefixCache.get(guildId);
    const [settings] = await db.select().from(guildSettingsTable).where(eq(guildSettingsTable.guildId, guildId));
    const prefix = settings?.prefix ?? DEFAULT_PREFIX;
    prefixCache.set(guildId, prefix);
    return prefix;
}
export async function setPrefix(guildId, prefix) {
    await db
        .insert(guildSettingsTable)
        .values({ guildId, prefix })
        .onConflictDoUpdate({ target: guildSettingsTable.guildId, set: { prefix, updatedAt: new Date() } });
    prefixCache.set(guildId, prefix);
}
export async function getNoPrefixMode(guildId) {
    if (noPrefixCache.has(guildId))
        return noPrefixCache.get(guildId);
    const [settings] = await db.select().from(guildSettingsTable).where(eq(guildSettingsTable.guildId, guildId));
    const val = settings?.noPrefixMode ?? false;
    noPrefixCache.set(guildId, val);
    return val;
}
export async function setNoPrefixMode(guildId, enabled) {
    await db
        .insert(guildSettingsTable)
        .values({ guildId, noPrefixMode: enabled })
        .onConflictDoUpdate({ target: guildSettingsTable.guildId, set: { noPrefixMode: enabled, updatedAt: new Date() } });
    noPrefixCache.set(guildId, enabled);
}
