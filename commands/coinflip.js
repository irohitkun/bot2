import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { animateInteraction } from "../utils/community.js";
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
    await animateInteraction(interaction, [
        "🪙 Pulling a shiny coin from the pouch...",
        "🌀 Tossing it high into the air...",
        "✋ Catching it and checking the face...",
    ], { content: "", embeds: [embed] });
}
