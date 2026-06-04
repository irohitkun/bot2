import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";

const styleCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const DEFAULT_COLOR = 0x9b59b6; // Purple

export async function getGuildStyle(guildId) {
    const cached = styleCache.get(guildId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.value;
    }

    const [row] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guildId));
    const style = {
        color: row?.embedColor ? parseInt(row.embedColor.replace("#", ""), 16) || DEFAULT_COLOR : DEFAULT_COLOR,
        footer: row?.footerText ?? null,
    };
    styleCache.set(guildId, { value: style, fetchedAt: Date.now() });
    return style;
}

export function invalidateStyleCache(guildId) {
    styleCache.delete(guildId);
}

export async function getWelcomeConfig(guildId) {
    const [row] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guildId));
    return { channelId: row?.welcomeChannelId ?? null, message: row?.welcomeMessage ?? null };
}

export async function getLogChannel(guildId) {
    const [row] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guildId));
    return row?.logChannelId ?? null;
}

export function hexToInt(hex) {
    const clean = hex.replace("#", "").trim();
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
    return parseInt(clean, 16);
}
