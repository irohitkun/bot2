import { getGuildStyle } from "../utils/guildStyle.js";
import { animateMessage, createProfileEmbed, getMemberRank, getOrCreateMemberStats } from "../utils/community.js";

export const command = {
    name: "profile",
    usage: "%profile [@user]",
    description: "View your community profile",
    async execute(message) {
        const target = message.mentions.users.first() ?? message.author;
        const { color } = await getGuildStyle(message.guild.id);
        const stats = await getOrCreateMemberStats(message.guild.id, target);
        const rank = await getMemberRank(message.guild.id, target.id, stats.xp);
        const embed = createProfileEmbed({ user: target, stats, rank, color });

        await animateMessage(message, [
            "Opening the community profile...",
            "Counting coins and XP...",
            "Polishing the profile card...",
        ], { content: null, embeds: [embed] });
    },
};