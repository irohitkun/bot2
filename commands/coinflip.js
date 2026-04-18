import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin");
export async function execute(interaction) {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("🪙 Coin Flip")
        .setDescription(`**${result}!**`)
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
