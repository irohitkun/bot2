import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { helpCategories, getHelpCategory, formatCommands } from "../utils/helpCatalog.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { getPrefix } from "../utils/prefixCache.js";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse available bot commands")
    .addStringOption((option) =>
        option
            .setName("category")
            .setDescription("Command category to view")
            .setRequired(false)
            .addChoices(...helpCategories.map((category) => ({ name: category.label, value: category.key }))),
    );

export async function execute(interaction) {
    const selected = interaction.options.getString("category");
    const { color } = await getGuildStyle(interaction.guild.id);
    const prefix = await getPrefix(interaction.guild.id);
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(selected ? `${getHelpCategory(selected)?.label ?? "Commands"} Commands` : "Bot Help Center")
        .setDescription(`Use slash commands with \`/\` or prefix commands with \`${prefix}\`.`)
        .setTimestamp();

    if (selected) {
        const category = getHelpCategory(selected);
        if (!category) {
            return interaction.reply({ content: "Unknown help category.", flags: 64 });
        }
        embed.addFields({ name: category.label, value: formatCommands(category.commands) });
    } else {
        for (const category of helpCategories) {
            embed.addFields({ name: category.label, value: formatCommands(category.commands.slice(0, 6)) });
        }
        embed.setFooter({ text: "Run /help category:<name> to see a full category." });
    }

    await interaction.reply({ embeds: [embed], flags: 64 });
}