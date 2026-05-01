import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { sendModLog } from "../utils/modLog.js";

export const data = new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel so members cannot send messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to lock (defaults to current)").setRequired(false))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for locking").setRequired(false));

export async function execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
    const reason = interaction.options.getString("reason") ?? "Channel locked by moderator";
    const guild = interaction.guild;

    await targetChannel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });

    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Channel Locked")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Moderator", value: interaction.user.tag, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Channel Locked")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp()
    );
}
