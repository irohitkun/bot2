import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode for a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((opt) => opt
    .setName("seconds")
    .setDescription("Seconds between messages (0 to disable, max 21600)")
    .setMinValue(0)
    .setMaxValue(21600)
    .setRequired(true))
    .addChannelOption((opt) => opt.setName("channel").setDescription("Target channel (defaults to current)").setRequired(false));
export async function execute(interaction) {
    const seconds = interaction.options.getInteger("seconds", true);
    const targetChannel = (interaction.options.getChannel("channel") ?? interaction.channel);
    await targetChannel.setRateLimitPerUser(seconds, `Set by ${interaction.user.tag}`);
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⏱️ Slowmode Updated")
        .addFields({ name: "Channel", value: targetChannel.toString(), inline: true }, { name: "Slowmode", value: seconds === 0 ? "Disabled" : `${seconds} second(s)`, inline: true }, { name: "Set By", value: interaction.user.tag, inline: true })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
