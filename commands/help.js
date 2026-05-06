import {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} from "discord.js";
import { helpCategories, getHelpCategory, formatCommands } from "../utils/helpCatalog.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { getPrefix } from "../utils/prefixCache.js";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse all bot commands with an interactive category menu");

export async function execute(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const prefix = await getPrefix(interaction.guild.id);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("📖 Bot Help Center")
        .setDescription(
            `Use slash commands with \`/\` or prefix commands with \`${prefix}\`\n\n**Select a category below** to view its commands in detail.`
        )
        .setTimestamp();

    for (const category of helpCategories) {
        const preview = category.commands.slice(0, 4).map(([name]) => `\`${name}\``).join(", ");
        const more = category.commands.length > 4 ? ` +${category.commands.length - 4} more` : "";
        embed.addFields({ name: `${category.emoji ?? "📁"} ${category.label}`, value: preview + more, inline: true });
    }

    embed.setFooter({ text: "Use the dropdown below to explore each category" });

    const menu = new StringSelectMenuBuilder()
        .setCustomId("help:category")
        .setPlaceholder("📂 Choose a command category...")
        .addOptions(
            helpCategories.map((cat) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(cat.label)
                    .setValue(cat.key)
                    .setDescription(cat.description ?? `View all ${cat.label.toLowerCase()} commands`)
                    .setEmoji(cat.emoji ?? "📁")
            )
        );

    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.reply({ embeds: [embed], components: [row] });
}
