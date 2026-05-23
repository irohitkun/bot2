import { EmbedBuilder } from "discord.js";
import { getLeaderboard, calculateLevel } from "../utils/community.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const command = {
    name: "leaderboard",
    aliases: ["lb", "top"],
    usage: "%leaderboard [limit]",
    description: "Show the top members in this server by XP",
    async execute(message, args) {
        const limit = Math.min(25, Math.max(1, parseInt(args[0], 10) || 10));
        const { color } = await getGuildStyle(message.guild.id);
        const rows = await getLeaderboard(message.guild.id, limit);

        if (rows.length === 0) {
            return message.reply("No members have earned XP in this server yet. Chat to start climbing the ranks!");
        }

        const medals = ["🥇", "🥈", "🥉"];
        const lines = rows.map((row, i) => {
            const levelInfo = calculateLevel(row.xp);
            const medal = medals[i] ?? `**#${i + 1}**`;
            return `${medal} **${row.userTag}** — Level ${levelInfo.level} · ${row.xp} XP`;
        });

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`🏆 ${message.guild.name} — Leaderboard`)
            .setDescription(lines.join("\n"))
            .setFooter({ text: "Earn XP by chatting · Use %rank to see your position" })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },
};
