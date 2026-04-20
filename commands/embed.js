import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";
export const data = new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Send a custom embed message")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((opt) => opt.setName("title").setDescription("Embed title").setRequired(true).setMaxLength(256))
    .addStringOption((opt) => opt.setName("description").setDescription("Embed description").setRequired(true).setMaxLength(4096))
    .addStringOption((opt) => opt.setName("color").setDescription("Hex color e.g. ff5733 (default: blurple)").setRequired(false))
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to send in (defaults to current)").setRequired(false));
export async function execute(interaction) {
    if (!(await isPremiumGuild(interaction.guild.id))) {
        return interaction.reply({ embeds: [premiumDeniedEmbed("Embed Builder")], flags: 64 });
    }
    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description", true);
    const hexInput = interaction.options.getString("color");
    const channel = (interaction.options.getChannel("channel") ?? interaction.channel);
    let color = 0x5865f2;
    if (hexInput) {
        const clean = hexInput.replace("#", "").trim();
        if (!/^[0-9a-fA-F]{6}$/.test(clean))
            return interaction.reply({ content: "❌ Invalid hex color.", flags: 64 });
        color = parseInt(clean, 16);
    }
    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Embed sent to ${channel}.`, flags: 64 });
}
