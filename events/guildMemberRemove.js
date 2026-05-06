import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
import { trackKick } from "../utils/antinuke.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member) {
    const guild = member.guild;

    // Check audit log to determine if this was a kick (not a voluntary leave)
    let wasKicked = false;
    let executorId = null;
    try {
        const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
        const entry = logs.entries.first();
        if (entry && entry.target?.id === member.id && (Date.now() - entry.createdTimestamp) < 5000) {
            wasKicked = true;
            executorId = entry.executor?.id;
        }
    } catch {}

    // AntiNuke kick tracking
    if (wasKicked && executorId && executorId !== guild.client.user.id) {
        await trackKick(guild, executorId).catch(() => {});
    }

    // ── Log to mod-log channel ─────────────────────────────────────────────────
    try {
        const [customization] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guild.id));
        if (!customization?.logChannelId) return;
        const logChannel = guild.channels.cache.get(customization.logChannelId);
        if (!logChannel?.isTextBased()) return;

        if (wasKicked) {
            const embed = new EmbedBuilder()
                .setColor(0xfee75c)
                .setTitle("👢 Member Kicked")
                .addFields(
                    { name: "Member", value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: "Kicked By", value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
                    { name: "Joined At", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>` : "Unknown", inline: false },
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor(0x95a5a6)
                .setTitle("🚪 Member Left")
                .addFields(
                    { name: "Member", value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: "Joined At", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>` : "Unknown", inline: true },
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });
        }
    } catch {}
}
