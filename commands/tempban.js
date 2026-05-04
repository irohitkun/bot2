import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, tempBansTable } from "../db/index.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { sendModLog, applyFooter } from "../utils/modLog.js";
import { parseDuration, formatDuration } from "../utils/parseDuration.js";
import { scheduleUnban } from "../utils/tempBanScheduler.js";

export const data = new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Temporarily ban a member — auto-unbanned when the duration expires")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("The member to temp ban").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("Duration e.g. 1h, 12h, 7d, 2w").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the ban").setRequired(false))
    .addIntegerOption((o) => o.setName("delete_days").setDescription("Days of messages to delete (0-7)").setMinValue(0).setMaxValue(7).setRequired(false));

export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const durationStr = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const guild = interaction.guild;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (member) {
        if (!member.bannable) return interaction.reply({ content: "❌ I cannot ban this user (higher role or server owner).", flags: 64 });
        if (member.id === interaction.user.id) return interaction.reply({ content: "❌ You cannot ban yourself.", flags: 64 });
        if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== guild.ownerId) {
            return interaction.reply({ content: "❌ You cannot ban someone with an equal or higher role than you.", flags: 64 });
        }
    }

    const ms = parseDuration(durationStr);
    if (!ms || ms < 60_000) {
        return interaction.reply({ content: "❌ Invalid or too short duration. Examples: `1h`, `12h`, `7d`, `2w`. Minimum: 1 minute.", flags: 64 });
    }
    const MAX_MS = 365 * 24 * 60 * 60 * 1000;
    if (ms > MAX_MS) return interaction.reply({ content: "❌ Maximum temp ban duration is 1 year.", flags: 64 });

    await interaction.deferReply();

    const unbanAt = new Date(Date.now() + ms);
    const label = formatDuration(ms);

    await guild.members.ban(target.id, {
        deleteMessageSeconds: deleteDays * 86400,
        reason: `[TempBan: ${label}] ${reason} — by ${interaction.user.tag}`,
    });

    const [row] = await db.insert(tempBansTable).values({
        guildId: guild.id,
        userId: target.id,
        userTag: target.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        unbanAt,
    }).returning();

    scheduleUnban(interaction.client, row, ms);

    const style = await getGuildStyle(guild.id);
    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⏰ Member Temporarily Banned")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: interaction.user.tag, inline: true },
            { name: "Duration", value: label, inline: true },
            { name: "Reason", value: reason },
            { name: "Auto-unban", value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:F> (<t:${Math.floor(unbanAt.getTime() / 1000)}:R>)` },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();
    applyFooter(embed, style);
    await interaction.editReply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⏰ Temporary Ban Issued")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Duration", value: label, inline: true },
            { name: "Reason", value: reason },
            { name: "Expires", value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:F>` },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp()
    );
}
