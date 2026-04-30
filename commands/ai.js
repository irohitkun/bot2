import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { hasTier, premiumDeniedEmbed } from "../utils/permissions.js";
import { runAIAssistant } from "../utils/aiAssistant.js";

export const data = new SlashCommandBuilder()
    .setName("ai")
    .setDescription("[Premium] AI Assistant — describe an action and the bot performs it")
    .addStringOption((opt) =>
        opt.setName("prompt")
            .setDescription("Describe what to do (e.g. 'timeout @user 10m for spam, then purge their last 20 messages')")
            .setRequired(true)
            .setMaxLength(1500)
    );

export async function execute(interaction) {
    const guild = interaction.guild;
    const member = interaction.member;
    const channel = interaction.channel;

    if (!await hasTier(guild.id, "premium")) {
        return interaction.reply({ embeds: [premiumDeniedEmbed("AI Assistant")], flags: 64 });
    }

    const prompt = interaction.options.getString("prompt", true);
    await interaction.deferReply();

    const fetchedMember = member.permissions ? member : await guild.members.fetch(interaction.user.id);
    const result = await runAIAssistant({
        prompt,
        member: fetchedMember,
        channel,
        guild,
    });

    await interaction.editReply(result.payload);
}
