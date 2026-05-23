import { EmbedBuilder } from "discord.js";
import { animateMessage } from "../utils/community.js";
export const command = {
    name: "dice",
    usage: "%dice [sides] [count]",
    description: "Roll a dice",
    async execute(message, args) {
        const sides = Math.min(1000, Math.max(2, parseInt(args[0] ?? "6") || 6));
        const count = Math.min(10, Math.max(1, parseInt(args[1] ?? "1") || 1));
        const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
        const total = rolls.reduce((a, b) => a + b, 0);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎲 Dice Roll")
            .addFields(
                { name: "Rolls", value: rolls.map((r) => `**${r}**`).join(", "), inline: true },
                { name: "Total", value: `**${total}**`, inline: true },
                { name: "Dice", value: `${count}d${sides}`, inline: true },
            )
            .setTimestamp();
        await animateMessage(message, [
            `🎲 Picking up ${count}d${sides}...`,
            "🤞 Giving the dice a lucky shake...",
            "🧮 Counting the final roll...",
        ], { content: "", embeds: [embed] });
    },
};
