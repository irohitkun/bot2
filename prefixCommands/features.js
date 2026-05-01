import { createRequire } from "module";
import { EmbedBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";

const _require = createRequire(import.meta.url);

export const command = {
    name: "features",
    usage: "%features [category]",
    description: "Browse everything this bot can do",
    async execute(message, args) {
        const FEATURES = _require("../config/features.json");
        const { color } = await getGuildStyle(message.guild?.id ?? "");
        const categoryKey = args[0]?.toLowerCase().replace(/[- ]/g, "_");

        if (categoryKey && FEATURES.modules[categoryKey]) {
            const mod = FEATURES.modules[categoryKey];
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`📋 ${mod.title}`)
                .setDescription(mod.items.map((item) => `• ${item}`).join("\n"))
                .setFooter({ text: `${FEATURES.name} v${FEATURES.version}` })
                .setTimestamp();
            return void message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`📋 ${FEATURES.name} — All Features`)
            .setDescription(`**${FEATURES.tagline}**\nVersion: \`${FEATURES.version}\`\n\nTip: \`%features <category>\` for details.\nCategories: ${Object.keys(FEATURES.modules).join(", ")}`)
            .setTimestamp();

        for (const mod of Object.values(FEATURES.modules)) {
            embed.addFields({
                name: mod.title,
                value: mod.items.slice(0, 2).map((i) => `• ${i}`).join("\n") + (mod.items.length > 2 ? `\n• _…and ${mod.items.length - 2} more_` : ""),
                inline: false,
            });
        }

        embed.setFooter({ text: `${FEATURES.name} v${FEATURES.version}` });
        return void message.reply({ embeds: [embed] });
    },
};
