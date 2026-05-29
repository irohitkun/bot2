import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { sendModLog, applyFooter } from "../utils/modLog.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel so members cannot send messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to lock (defaults to current)").setRequired(false))
    .addRoleOption((opt) => opt.setName("role").setDescription("Role to restrict (defaults to @everyone — use your Member role if you have one)").setRequired(false))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for locking").setRequired(false));

export async function execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
    const targetRole = interaction.options.getRole("role") ?? interaction.guild.roles.everyone;
    const reason = interaction.options.getString("reason") ?? "Channel locked by moderator";
    const guild = interaction.guild;

    const me = guild.members.me;
    if (!targetChannel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: "❌ I don't have permission to manage that channel.", flags: 64 });
    }

    try {
        await targetChannel.permissionOverwrites.edit(targetRole, { SendMessages: false }, { reason });
    } catch (err) {
        return interaction.reply({ content: `❌ Failed to lock the channel: ${err.message}`, flags: 64 });
    }

    const roleLabel = targetRole.id === guild.roles.everyone.id ? "@everyone" : `<@&${targetRole.id}>`;
    const style = await getGuildStyle(guild.id);
    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Channel Locked")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Moderator", value: interaction.user.tag, inline: true },
            { name: "Restricted Role", value: roleLabel, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp();
    applyFooter(embed, style);
    await interaction.reply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Channel Locked")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Restricted Role", value: roleLabel, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp()
    );
}
