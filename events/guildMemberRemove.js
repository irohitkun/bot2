import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
import { trackKick } from "../utils/antinuke.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { getTemplate, buildEmbedFromTemplate, applyVars } from "../utils/embedTemplates.js";

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member) {
    const guild = member.guild;

    // Check audit log to determine if this was a kick
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

    // Fetch customization for logging + leave messages
    const [customization] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guild.id)).catch(() => [null]);
    const style = await getGuildStyle(guild.id).catch(() => ({ color: 0xed4245 }));

    // ── Leave / goodbye message ───────────────────────────────────────────────
    if (customization?.leaveChannelId) {
        try {
            const leaveChannel = guild.channels.cache.get(customization.leaveChannelId);
            if (leaveChannel?.isTextBased()) {
                const vars = {
                    userMention: member.toString(),
                    userName: member.user.username,
                    userTag: member.user.tag,
                    userAvatar: member.user.displayAvatarURL({ size: 256 }),
                    serverName: guild.name,
                    serverIcon: guild.iconURL({ size: 256 }) ?? "",
                    count: guild.memberCount,
                };

                let leaveEmbed;
                if (customization.leaveEmbedTemplate) {
                    const template = await getTemplate(guild.id, customization.leaveEmbedTemplate);
                    if (template) leaveEmbed = buildEmbedFromTemplate(template, vars, style.color);
                }
                if (!leaveEmbed) {
                    const defaultMsg = "👋 **{user.name}** has left **{server}**. We now have **{count}** members.";
                    const text = applyVars(customization.leaveMessage ?? defaultMsg, vars);
                    leaveEmbed = new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle("👋 Member Left")
                        .setDescription(text)
                        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                        .setTimestamp();
                }
                await leaveChannel.send({ embeds: [leaveEmbed] }).catch(() => {});
            }
        } catch {}
    }

    // ── Mod-log logging ───────────────────────────────────────────────────────
    if (!customization?.logChannelId) return;
    try {
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
