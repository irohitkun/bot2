import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
import { trackBan } from "../utils/antinuke.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";

export const name = Events.GuildBanAdd;
export const once = false;

export async function execute(ban) {
    const guild = ban.guild;
    let executorId = null;

    try {
        const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBan, limit: 1 });
        const entry = logs.entries.first();
        if (entry && entry.target?.id === ban.user.id && (Date.now() - entry.createdTimestamp) < 5000) {
            executorId = entry.executor?.id;
        }
    } catch {}

    // AntiNuke ban tracking
    if (executorId && executorId !== guild.client.user.id) {
        await trackBan(guild, executorId).catch(() => {});
    }

    // ── Log to mod-log channel ─────────────────────────────────────────────────
    try {
        const [customization] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guild.id));
        if (!customization?.logChannelId) return;
        const logChannel = guild.channels.cache.get(customization.logChannelId);
        if (!logChannel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔨 Member Banned")
            .addFields(
                { name: "User", value: `${ban.user.tag} (${ban.user.id})`, inline: true },
                { name: "Banned By", value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
                { name: "Reason", value: ban.reason ?? "No reason provided", inline: false },
            )
            .setThumbnail(ban.user.displayAvatarURL())
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    } catch {}
}
