import { SlashCommandBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { animateInteraction, claimDailyReward, createDailyEmbed } from "../utils/community.js";

export const data = new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily community coins and XP");

export async function execute(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const result = await claimDailyReward(interaction.guild.id, interaction.user);
    const embed = createDailyEmbed({ user: interaction.user, result, color });

    await animateInteraction(interaction, [
        "Checking today's reward chest...",
        "Rolling the daily bonus...",
        "Adding rewards to your profile...",
    ], { content: null, embeds: [embed] });
}