import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { animateInteraction } from "../utils/community.js";
export const data = new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Roll a dice")
    .addIntegerOption((opt) => opt.setName("sides").setDescription("Number of sides (default 6)").setMinValue(2).setMaxValue(1000).setRequired(false))
    .addIntegerOption((opt) => opt.setName("count").setDescription("Number of dice to roll (default 1)").setMinValue(1).setMaxValue(10).setRequired(false));
export async function execute(interaction) {
    const sides = interaction.options.getInteger("sides") ?? 6;
    const count = interaction.options.getInteger("count") ?? 1;
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);
    const embed = new EmbedBuilder().setColor(0x5865f2)
        .setTitle("🎲 Dice Roll")
        .addFields({ name: "Rolls", value: rolls.map((r) => `**${r}**`).join(", "), inline: true }, { name: "Total", value: `**${total}**`, inline: true }, { name: "Dice", value: `${count}d${sides}`, inline: true })
        .setTimestamp();
    await animateInteraction(interaction, [
        `🎲 Picking up ${count}d${sides}...`,
        "🤞 Giving the dice a lucky shake...",
        "🧮 Counting the final roll...",
    ], { content: "", embeds: [embed] });
}
