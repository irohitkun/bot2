import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { sendModLog, applyFooter } from "../utils/modLog.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel so members can send messages again")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to unlock (defaults to current)").setRequired(false))
    .addRoleOption((opt) => opt.setName("role").setDescription("Role to restore (defaults to @everyone — use your Member role if you have one)").setRequired(false))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for unlocking").setRequired(false));

export async function execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
    const targetRole = interaction.options.getRole("role") ?? interaction.guild.roles.everyone;
    const reason = interaction.options.getString("reason") ?? "Channel unlocked by moderator";
    const guild = interaction.guild;

    const me = guild.members.me;
    if (!targetChannel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: "❌ I don't have permission to manage that channel.", flags: 64 });
    }

    try {
        // null = remove the override entirely, restoring the role's inherited permissions
        await targetChannel.permissionOverwrites.edit(targetRole, { SendMessages: null }, { reason });
    } catch (err) {
        return interaction.reply({ content: `❌ Failed to unlock the channel: ${err.message}`, flags: 64 });
    }

    const roleLabel = targetRole.id === guild.roles.everyone.id ? "@everyone" : `<@&${targetRole.id}>`;
    const style = await getGuildStyle(guild.id);
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Channel Unlocked")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Moderator", value: interaction.user.tag, inline: true },
            { name: "Restored Role", value: roleLabel, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp();
    applyFooter(embed, style);
    await interaction.reply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Channel Unlocked")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Restored Role", value: roleLabel, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp()
    );
}
