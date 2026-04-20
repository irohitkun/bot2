import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLeaderboard, calculateLevel } from "../utils/community.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top members in this server by XP")
    .addIntegerOption((opt) =>
        opt.setName("limit")
            .setDescription("How many members to show (1–25, default 10)")
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
    );

export async function execute(interaction) {
    await interaction.deferReply();
    const guildId = interaction.guild.id;
    const limit = interaction.options.getInteger("limit") ?? 10;
    const { color } = await getGuildStyle(guildId);

    const rows = await getLeaderboard(guildId, limit);

    if (rows.length === 0) {
        return interaction.editReply({
            content: "No members have earned XP in this server yet. Chat to start climbing the ranks!",
        });
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = rows.map((row, i) => {
        const levelInfo = calculateLevel(row.xp);
        const medal = medals[i] ?? `**#${i + 1}**`;
        return `${medal} **${row.userTag}** — Level ${levelInfo.level} · ${row.xp} XP`;
    });

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🏆 ${interaction.guild.name} — Leaderboard`)
        .setDescription(lines.join("\n"))
        .setFooter({ text: "Earn XP by chatting · Use /rank to see your position" })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}
