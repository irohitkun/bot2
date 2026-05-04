import { EmbedBuilder } from "discord.js";
import { db, tempBansTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { sendModLog } from "./modLog.js";
import { safeSetTimeout } from "./giveawayScheduler.js";

const scheduled = new Set(); // ban IDs currently scheduled — prevents duplicates

/**
 * On bot startup: load every non-expired temp ban from the DB and reschedule them.
 * Called once from events/ready.js.
 */
export async function recoverTempBans(client) {
    try {
        const pending = await db.select().from(tempBansTable).where(eq(tempBansTable.unbanned, false));
        if (pending.length === 0) return;
        let count = 0;
        const now = Date.now();
        for (const row of pending) {
            if (scheduled.has(row.id)) continue;
            const delay = row.unbanAt.getTime() - now;
            if (delay <= 0) {
                executeUnban(client, row);
            } else {
                scheduleUnban(client, row, delay);
            }
            count++;
        }
        if (count > 0) console.log(`[TempBan] Recovered ${count} pending temp ban(s).`);
    } catch (err) {
        console.error("[TempBan] Failed to recover temp bans:", err);
    }
}

/**
 * Schedule an automatic unban for a temp ban row.
 * @param {import("discord.js").Client} client
 * @param {{ id: number, guildId: string, userId: string, userTag: string, reason: string, unbanAt: Date }} row
 * @param {number} [delayMs]
 */
export function scheduleUnban(client, row, delayMs) {
    if (scheduled.has(row.id)) return;
    scheduled.add(row.id);
    const delay = delayMs ?? Math.max(0, row.unbanAt.getTime() - Date.now());
    safeSetTimeout(async () => {
        scheduled.delete(row.id);
        await executeUnban(client, row);
    }, delay);
}

async function executeUnban(client, row) {
    try {
        const guild = client.guilds.cache.get(row.guildId)
            ?? await client.guilds.fetch(row.guildId).catch(() => null);

        if (guild) {
            await guild.members.unban(row.userId, `Temporary ban expired — original reason: ${row.reason}`)
                .catch(() => {}); // already unbanned manually? fine
        } else {
            console.warn(`[TempBan] Guild ${row.guildId} not accessible — marking ban #${row.id} as unbanned anyway.`);
        }

        await db.update(tempBansTable)
            .set({ unbanned: true, unbannedAt: new Date() })
            .where(eq(tempBansTable.id, row.id));

        if (guild) {
            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("⏰ Temporary Ban Expired")
                .addFields(
                    { name: "User", value: `${row.userTag} (${row.userId})`, inline: true },
                    { name: "Original Reason", value: row.reason, inline: false },
                    { name: "Expired", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                )
                .setTimestamp();
            await sendModLog(guild, embed, "TempBan Scheduler");
        }
    } catch (err) {
        console.error(`[TempBan] Failed to execute unban for ban #${row.id}:`, err);
    }
}
