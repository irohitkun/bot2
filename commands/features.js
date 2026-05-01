import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { createRequire } from "module";
import { getGuildStyle } from "../utils/guildStyle.js";

const _require = createRequire(import.meta.url);

export const data = new SlashCommandBuilder()
    .setName("features")
    .setDescription("Browse everything this bot can do")
    .addStringOption((opt) =>
        opt.setName("category")
            .setDescription("Show one category in detail")
            .setRequired(false)
            .addChoices(
                { name: "Moderation", value: "moderation" },
                { name: "Channel Management", value: "channel_management" },
                { name: "Role Management", value: "role_management" },
                { name: "Tickets", value: "tickets" },
                { name: "Giveaways", value: "giveaways" },
                { name: "Polls", value: "polls" },
                { name: "Economy & Levels", value: "economy" },
                { name: "AutoMod", value: "automod" },
                { name: "Utilities", value: "utilities" },
                { name: "Server Setup", value: "server_setup" },
                { name: "AI Assistant", value: "ai_assistant" },
            ));

export async function execute(interaction) {
    const FEATURES = _require("../config/features.json");
    await interaction.deferReply({ flags: 64 });
    const { color } = await getGuildStyle(interaction.guild.id);
    const categoryKey = interaction.options.getString("category");

    if (categoryKey) {
        const mod = FEATURES.modules[categoryKey];
        if (!mod) return interaction.editReply({ content: "❌ Category not found." });

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`📋 ${mod.title}`)
            .setDescription(mod.items.map((item) => `• ${item}`).join("\n"))
            .setFooter({ text: `${FEATURES.name} v${FEATURES.version} • Use /features for all categories` })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }

    // Overview: list all modules with item count
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`📋 ${FEATURES.name} — All Features`)
        .setDescription(`**${FEATURES.tagline}**\nBot version: \`${FEATURES.version}\`\n\nUse \`/features category:<name>\` to see details for any section.`)
        .setTimestamp();

    for (const mod of Object.values(FEATURES.modules)) {
        embed.addFields({
            name: mod.title,
            value: mod.items.slice(0, 3).map((i) => `• ${i}`).join("\n") + (mod.items.length > 3 ? `\n• _…and ${mod.items.length - 3} more_` : ""),
            inline: false,
        });
    }

    embed.setFooter({ text: `${FEATURES.name} v${FEATURES.version} • Changelog: latest — ${FEATURES.changelog[0]}` });
    return interaction.editReply({ embeds: [embed] });
}
