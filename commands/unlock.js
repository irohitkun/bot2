import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { sendModLog } from "../utils/modLog.js";

export const data = new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel so members can send messages again")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to unlock (defaults to current)").setRequired(false));

export async function execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
    const guild = interaction.guild;

    await targetChannel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Channel Unlocked")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Moderator", value: interaction.user.tag, inline: true },
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Channel Unlocked")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        )
        .setTimestamp()
    );
}
