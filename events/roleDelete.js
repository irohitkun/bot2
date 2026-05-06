import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
import { trackRoleDelete } from "../utils/antinuke.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";

export const name = Events.GuildRoleDelete;
export const once = false;

export async function execute(role) {
    if (!role.guild) return;

    // AntiNuke tracking
    try {
        const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
        const entry = logs.entries.first();
        if (entry && (Date.now() - entry.createdTimestamp) < 5000) {
            await trackRoleDelete(role.guild, entry.executor.id);
        }
    } catch {}

    // Log to mod-log channel
    try {
        const [customization] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, role.guild.id));
        if (!customization?.logChannelId) return;
        const logChannel = role.guild.channels.cache.get(customization.logChannelId);
        if (!logChannel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🗑️ Role Deleted")
            .addFields(
                { name: "Role Name", value: role.name, inline: true },
                { name: "Role Color", value: role.hexColor, inline: true },
                { name: "Members Had Role", value: `${role.members?.size ?? "?"}`, inline: true },
            )
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    } catch {}
}
