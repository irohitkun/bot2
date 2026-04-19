import { SlashCommandBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { animateInteraction, createRankEmbed, getLeaderboard, getMemberRank, getOrCreateMemberStats } from "../utils/community.js";

export const data = new SlashCommandBuilder()
    .setName("rank")
    .setDescription("View your server rank and leaderboard preview")
    .addUserOption((option) =>
        option.setName("user").setDescription("The member rank to view").setRequired(false),
    );

export async function execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const { color } = await getGuildStyle(interaction.guild.id);
    const stats = await getOrCreateMemberStats(interaction.guild.id, target);
    const rank = await getMemberRank(interaction.guild.id, target.id, stats.xp);
    const leaderboard = await getLeaderboard(interaction.guild.id);
    const embed = createRankEmbed({ user: target, stats, rank, leaderboard, color });

    await animateInteraction(interaction, [
        "Scanning the server leaderboard...",
        "Comparing XP totals...",
        "Locking in the current rank...",
    ], { content: null, embeds: [embed] });
}