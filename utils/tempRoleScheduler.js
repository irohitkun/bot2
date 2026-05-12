/**
 * Temp Role Scheduler — recover and re-schedule temp roles on bot restart.
 * Called once from events/ready.js
 */

import { EmbedBuilder } from "discord.js";
import { db, tempRolesTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { sendModLog } from "./modLog.js";
import { safeSetTimeout } from "./giveawayScheduler.js";

const scheduled = new Set();

export async function recoverTempRoles(client) {
    try {
        const pending = await db.select().from(tempRolesTable).where(eq(tempRolesTable.removed, false));
        if (pending.length === 0) return;
        const now = Date.now();
        let count = 0;
        for (const row of pending) {
            if (scheduled.has(row.id)) continue;
            const delay = row.expiresAt.getTime() - now;
            if (delay <= 0) {
                await executeTempRoleRemoval(client, row);
            } else {
                scheduleTempRoleEntry(client, row, delay);
            }
            count++;
        }
        if (count > 0) console.log(`[TempRole] Recovered ${count} pending temp role(s).`);
    } catch (err) {
        console.error("[TempRole] Failed to recover temp roles:", err);
    }
}

export function scheduleTempRoleEntry(client, row, delayMs) {
    if (scheduled.has(row.id)) return;
    scheduled.add(row.id);
    const delay = delayMs ?? Math.max(0, row.expiresAt.getTime() - Date.now());
    safeSetTimeout(async () => {
        scheduled.delete(row.id);
        await executeTempRoleRemoval(client, row);
    }, delay);
}

async function executeTempRoleRemoval(client, row) {
    try {
        const guild = client.guilds.cache.get(row.guildId) ?? await client.guilds.fetch(row.guildId).catch(() => null);
        if (guild) {
            const member = await guild.members.fetch(row.userId).catch(() => null);
            if (member?.roles.cache.has(row.roleId)) {
                await member.roles.remove(row.roleId, "Temp role expired").catch(() => {});
            }
            const role = guild.roles.cache.get(row.roleId);
            await sendModLog(guild, new EmbedBuilder()
                .setColor(0x95a5a6)
                .setTitle("🏷️ Temp Role Expired")
                .addFields(
                    { name: "User", value: `<@${row.userId}> (${row.userId})`, inline: true },
                    { name: "Role", value: role ? `<@&${row.roleId}>` : row.roleId, inline: true },
                    { name: "Original Reason", value: row.reason, inline: false },
                )
                .setTimestamp(), "TempRole Scheduler");
        }
        await db.update(tempRolesTable)
            .set({ removed: true, removedAt: new Date() })
            .where(eq(tempRolesTable.id, row.id));
    } catch (err) {
        console.error(`[TempRole] Failed to remove temp role #${row.id}:`, err);
    }
}
