import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { sendModLog, applyFooter } from "../utils/modLog.js";

export const data = new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((opt) => opt.setName("user_id").setDescription("The Discord user ID to unban").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the unban").setRequired(false));

export async function execute(interaction) {
    const userId = interaction.options.getString("user_id", true).trim();
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guild = interaction.guild;

    const ban = await guild.bans.fetch(userId).catch(() => null);
    if (!ban) return interaction.reply({ content: "❌ This user is not banned or the ID is invalid.", flags: 64 });

    await guild.bans.remove(userId, reason);

    const style = await getGuildStyle(guild.id);

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Member Unbanned")
        .addFields(
            { name: "User", value: `${ban.user.tag} (${userId})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Reason", value: reason },
        )
        .setThumbnail(ban.user.displayAvatarURL())
        .setTimestamp();

    applyFooter(embed, style);
    await interaction.reply({ embeds: [embed] });
    await sendModLog(guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Member Unbanned")
        .addFields(
            { name: "User", value: `${ban.user.tag} (${userId})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Reason", value: reason },
        )
        .setThumbnail(ban.user.displayAvatarURL())
        .setTimestamp()
    );
}
