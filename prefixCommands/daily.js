import { getGuildStyle } from "../utils/guildStyle.js";
import { claimDailyReward, createDailyEmbed } from "../utils/community.js";

export const command = {
    name: "daily",
    usage: "%daily",
    description: "Claim your daily community coins and XP",
    async execute(message) {
        const { color } = await getGuildStyle(message.guild.id);
        const result = await claimDailyReward(message.guild.id, message.author);
        const embed = createDailyEmbed({ user: message.author, result, color });

        await message.reply({ embeds: [embed] });
    },
};