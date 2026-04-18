import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("color")
    .setDescription("Preview a hex color")
    .addStringOption((opt) => opt.setName("hex").setDescription("Hex color code e.g. #ff5733 or ff5733").setRequired(true));
export async function execute(interaction) {
    const hex = interaction.options.getString("hex", true).replace("#", "").trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex))
        return interaction.reply({ content: "❌ Invalid hex color. Use 6 hex characters e.g. `#ff5733`.", flags: 64 });
    const color = parseInt(hex, 16);
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎨 Color: #${hex.toUpperCase()}`)
        .addFields({ name: "Hex", value: `#${hex.toUpperCase()}`, inline: true }, { name: "RGB", value: `rgb(${r}, ${g}, ${b})`, inline: true }, { name: "Decimal", value: `${color}`, inline: true })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
