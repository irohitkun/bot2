import {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ButtonBuilder, ButtonStyle,
} from "discord.js";
import { helpCategories, getHelpCategory, formatCommands } from "../utils/helpCatalog.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { getPrefix } from "../utils/prefixCache.js";
import { DOCS_URL, FEEDBACK_URL } from "../config/constants.js";
import { LATEST } from "../data/changelog.js";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse all bot commands with an interactive category menu");

export async function execute(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const prefix = await getPrefix(interaction.guild.id);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("📖 CruxBot Help Center")
        .setDescription(
            `Use \`/command\` for slash or \`${prefix}command\` for prefix.\n` +
            `**[📖 Docs](${DOCS_URL})** · **[💬 Feedback](${FEEDBACK_URL})** · **[🚀 What's new in v${LATEST.version}](/changelog)**\n\n` +
            `Select a category below to see its commands.`
        )
        .setTimestamp();

    for (const category of helpCategories) {
        const preview = category.commands.slice(0, 4).map(([name]) => `\`${name}\``).join(", ");
        const more = category.commands.length > 4 ? ` +${category.commands.length - 4} more` : "";
        embed.addFields({ name: `${category.emoji ?? "📁"} ${category.label}`, value: preview + more, inline: true });
    }

    const totalCmds = helpCategories.reduce((a, c) => a + c.commands.length, 0);
    embed.setFooter({ text: `${totalCmds} commands · cruxbot.vercel.app` });

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

    const menuRow = new ActionRowBuilder().addComponents(menu);
    const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Documentation").setEmoji("📖").setStyle(ButtonStyle.Link).setURL(DOCS_URL),
        new ButtonBuilder().setLabel("Feedback & Suggestions").setEmoji("💬").setStyle(ButtonStyle.Link).setURL(FEEDBACK_URL),
    );

    await interaction.reply({ embeds: [embed], components: [menuRow, linkRow] });
}
