/**
 * Slowmode Auto-Expire Scheduler
 * --------------------------------
 * Stores pending slowmode removals in the DB so they survive bot restarts.
 * On startup, `recoverSlowmodeTimers` re-schedules any that haven't fired yet.
 */

import { db, slowmodeTimersTable } from "../db/index.js";
import { eq, lt } from "drizzle-orm";

/** In-memory map of channelId → NodeJS timer so we can cancel on re-set. */
const activeTimers = new Map();

/**
 * Schedule a slowmode removal for a channel.
 * @param {import("discord.js").Client} client
 * @param {{ id: number, guildId: string, channelId: string, expiresAt: Date }} row
 * @param {number} ms - milliseconds until removal
 */
export function scheduleSlowmodeRemoval(client, row, ms) {
    // Cancel any existing timer for this channel
    const existing = activeTimers.get(row.channelId);
    if (existing) clearTimeout(existing);

    const delay = Math.max(0, ms);
    const timer = setTimeout(() => removeSlowmode(client, row), delay);
    activeTimers.set(row.channelId, timer);
}

async function removeSlowmode(client, row) {
    activeTimers.delete(row.channelId);

    try {
        const guild = client.guilds.cache.get(row.guildId)
            ?? await client.guilds.fetch(row.guildId).catch(() => null);
        if (!guild) return;

        const channel = guild.channels.cache.get(row.channelId)
            ?? await guild.channels.fetch(row.channelId).catch(() => null);
        if (channel?.isTextBased()) {
            await channel.setRateLimitPerUser(0, "Slowmode auto-expired").catch(() => {});
            console.log(`[Slowmode] Auto-removed slowmode in #${channel.name} (${channel.id})`);
        }
    } catch (err) {
        console.warn("[Slowmode] Failed to auto-remove slowmode:", err.message);
    } finally {
        await db.delete(slowmodeTimersTable)
            .where(eq(slowmodeTimersTable.id, row.id))
            .catch(() => {});
    }
}

/**
 * Called once in the ready event. Re-schedules any unexpired slowmode timers
 * that were persisted across a bot restart.
 */
export async function recoverSlowmodeTimers(client) {
    try {
        const now = new Date();

        // Clean up any already-expired timers (fire them immediately)
        const overdue = await db.select().from(slowmodeTimersTable)
            .where(lt(slowmodeTimersTable.expiresAt, now));
        for (const row of overdue) {
            await removeSlowmode(client, row);
        }

        // Schedule future timers
        const pending = await db.select().from(slowmodeTimersTable);
        for (const row of pending) {
            const ms = row.expiresAt.getTime() - Date.now();
            scheduleSlowmodeRemoval(client, row, ms);
        }

        if (pending.length > 0) {
            console.log(`[Slowmode] Recovered ${pending.length} pending slowmode timer(s).`);
        }
    } catch (err) {
        console.warn("[Slowmode] Failed to recover timers:", err.message);
    }
}
