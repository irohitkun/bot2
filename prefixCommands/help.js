import {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
} from "discord.js";
import { helpCategories, getHelpCategory, formatCommands } from "../utils/helpCatalog.js";
import { getPrefix } from "../utils/prefixCache.js";
import { getGuildStyle } from "../utils/guildStyle.js";

/**
 * Builds the overview embed shown when no category is selected.
 */
function buildOverviewEmbed(prefix, color) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle("📖 Crux Help Center")
        .setDescription(
            `Use the dropdown below to browse commands by category.\n` +
            `Works with \`${prefix}\`, slash (/), and no-prefix mode.`
        )
        .addFields(
            helpCategories.map((cat) => ({
                name: `${cat.emoji} ${cat.label}`,
                value: cat.description,
                inline: true,
            }))
        )
        .setFooter({ text: `${prefix}help • /help • Showing all categories` })
        .setTimestamp();
}

/**
 * Builds the embed for a specific category.
 */
function buildCategoryEmbed(cat, prefix, color) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`${cat.emoji} ${cat.label}`)
        .setDescription(cat.description)
        .addFields({ name: "Commands", value: formatCommands(cat.commands) })
        .setFooter({ text: `${prefix}help • /help • Use the dropdown to switch categories` })
        .setTimestamp();
}

/**
 * Builds the category select menu row.
 */
function buildSelectMenu(selectedKey = null) {
    const options = helpCategories.map((cat) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setEmoji(cat.emoji)
            .setValue(cat.key)
            .setDescription(cat.description.slice(0, 100))
            .setDefault(cat.key === selectedKey)
    );
    const menu = new StringSelectMenuBuilder()
        .setCustomId("help:category")
        .setPlaceholder("Choose a category…")
        .addOptions(options);
    return new ActionRowBuilder().addComponents(menu);
}

export const command = {
    name: "help",
    aliases: ["h", "commands"],
    usage: "%help [category]",
    description: "Show the interactive help menu",

    async execute(message, args = []) {
        const prefix = await getPrefix(message.guild?.id ?? "");
        const style = await getGuildStyle(message.guild?.id ?? "");
        const color = style?.color ?? 0x5865f2;

        const categoryKey = args[0]?.toLowerCase() ?? null;
        const initialCategory = categoryKey ? getHelpCategory(categoryKey) : null;

        if (categoryKey && !initialCategory) {
            return message.reply(
                `❌ Unknown category \`${categoryKey}\`. Valid categories: ${helpCategories.map((c) => `\`${c.key}\``).join(", ")}`
            );
        }

        const embed = initialCategory
            ? buildCategoryEmbed(initialCategory, prefix, color)
            : buildOverviewEmbed(prefix, color);

        const row = buildSelectMenu(initialCategory?.key ?? null);

        const sent = await message.reply({ embeds: [embed], components: [row] });

        // Collector — listen for menu interaction
        const collector = sent.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.customId === "help:category",
            time: 3 * 60 * 1000, // 3 minutes
        });

        collector.on("collect", async (i) => {
            const selectedKey = i.values[0];
            const cat = getHelpCategory(selectedKey);
            if (!cat) return i.reply({ content: "❌ Unknown category.", flags: 64 });

            await i.update({
                embeds: [buildCategoryEmbed(cat, prefix, color)],
                components: [buildSelectMenu(selectedKey)],
            });
        });

        collector.on("end", async () => {
            try {
                const disabledMenu = new StringSelectMenuBuilder()
                    .setCustomId("help:category")
                    .setPlaceholder("Session expired — run the command again")
                    .setDisabled(true)
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel("Expired").setValue("expired")
                    );
                await sent.edit({ components: [new ActionRowBuilder().addComponents(disabledMenu)] });
            } catch {}
        });
    },
};
