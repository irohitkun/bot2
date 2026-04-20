import { SlashCommandBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { createProfileEmbed, getMemberRank, getOrCreateMemberStats } from "../utils/community.js";

export const data = new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your community profile")
    .addUserOption((option) =>
        option.setName("user").setDescription("The member profile to view").setRequired(false),
    );

export async function execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const { color } = await getGuildStyle(interaction.guild.id);
    const stats = await getOrCreateMemberStats(interaction.guild.id, target);
    const rank = await getMemberRank(interaction.guild.id, target.id, stats.xp);
    const embed = createProfileEmbed({ user: target, stats, rank, color });

    await interaction.reply({ embeds: [embed] });
}