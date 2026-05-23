import { getGuildStyle } from "../utils/guildStyle.js";
import { createRankEmbed, getLeaderboard, getMemberRank, getOrCreateMemberStats } from "../utils/community.js";

export const command = {
    name: "rank",
    aliases: ["level", "lvl", "xp"],
    usage: "%rank [@user]",
    description: "View your server rank",
    async execute(message) {
        const target = message.mentions.users.first() ?? message.author;
        const { color } = await getGuildStyle(message.guild.id);
        const stats = await getOrCreateMemberStats(message.guild.id, target);
        const rank = await getMemberRank(message.guild.id, target.id, stats.xp);
        const leaderboard = await getLeaderboard(message.guild.id);
        const embed = createRankEmbed({ user: target, stats, rank, leaderboard, color });

        await message.reply({ embeds: [embed] });
    },
};