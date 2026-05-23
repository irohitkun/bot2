import { EmbedBuilder } from "discord.js";
import { getPrefixHelpCategories, formatCommands } from "../utils/helpCatalog.js";
import { getPrefix } from "../utils/prefixCache.js";

export const command = {
    name: "help",
    usage: "%help [category]",
    description: "Show all available prefix commands",
    async execute(message, args = []) {
        const prefix = await getPrefix(message.guild.id);
        const selected = args[0]?.toLowerCase();
        const prefixCategories = getPrefixHelpCategories();
        const category = selected ? prefixCategories.find((item) => item.key === selected) : null;
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(category ? `${category.label} Commands` : "Prefix Help Center")
            .setDescription(`These commands work with the \`${prefix}\` prefix. Slash-only setup and premium management commands are not shown here.`)
            .setTimestamp();

        if (selected && !category) {
            return message.reply(`Unknown prefix category. Try: ${prefixCategories.map((item) => `\`${item.key}\``).join(", ")}`);
        }

        if (category) {
            embed.addFields({ name: category.label, value: formatCommands(category.commands, prefix) });
        } else {
            for (const item of prefixCategories) {
                embed.addFields({ name: item.label, value: formatCommands(item.commands.slice(0, 6), prefix) });
            }
            embed.setFooter({ text: `${prefix}help <category> for a full category.` });
        }

        await message.reply({ embeds: [embed] });
    },
};
