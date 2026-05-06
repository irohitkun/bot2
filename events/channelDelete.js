import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
import { trackChannelDelete } from "../utils/antinuke.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";

export const name = Events.ChannelDelete;
export const once = false;

export async function execute(channel) {
    if (!channel.guild) return;

    // AntiNuke tracking — fetch audit log to find who deleted the channel
    try {
        const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
        const entry = logs.entries.first();
        if (entry && (Date.now() - entry.createdTimestamp) < 5000) {
            await trackChannelDelete(channel.guild, entry.executor.id);
        }
    } catch {}

    // Log to mod-log channel
    try {
        const [customization] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, channel.guild.id));
        if (!customization?.logChannelId) return;
        const logChannel = channel.guild.channels.cache.get(customization.logChannelId);
        if (!logChannel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🗑️ Channel Deleted")
            .addFields(
                { name: "Channel Name", value: `#${channel.name}`, inline: true },
                { name: "Channel Type", value: channel.type?.toString() ?? "Unknown", inline: true },
                { name: "Category", value: channel.parent?.name ?? "None", inline: true },
            )
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    } catch {}
}
