import { EmbedBuilder } from "discord.js";
import { animateMessage } from "../utils/community.js";
export const command = {
    name: "coinflip",
    usage: "%coinflip",
    description: "Flip a coin",
    async execute(message) {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        const embed = new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🪙 Coin Flip")
            .setDescription(`**${result}!**`)
            .setTimestamp();
        await animateMessage(message, [
            "🪙 Pulling a shiny coin from the pouch...",
            "🌀 Tossing it high into the air...",
            "✋ Catching it and checking the face...",
        ], { content: "", embeds: [embed] });
    },
};
