import { CHANGELOG, LATEST } from "../data/changelog.js";
import { buildChangelogEmbed } from "../commands/changelog.js";

export const command = {
    name: "changelog",
    aliases: ["updates", "version", "whatsnew"],
    description: "View version history. Subcommands: latest, list, announce [#channel], version <ver>",
    async execute(message, args) {
        const sub = args[0]?.toLowerCase() ?? "latest";

        if (sub === "latest" || !sub) {
            const embed = buildChangelogEmbed(LATEST);
            return message.channel.send({ embeds: [embed] });
        }

        if (sub === "list") {
            const lines = CHANGELOG.map((v, i) =>
                `${i === 0 ? "→ " : "  "}\`v${v.version}\` — **${v.title}** *(${v.date})*`
            ).join("\n");
            return message.channel.send(`**📋 All Bot Versions**\n${lines}\n\nUse \`changelog version <ver>\` for details.`);
        }

        if (sub === "announce") {
            if (!message.member?.permissions?.has("ManageGuild")) {
                return message.reply("❌ You need Manage Server permission to announce updates.");
            }
            const channel = message.mentions.channels.first() ?? message.channel;
            const embed = buildChangelogEmbed(LATEST, message.author.tag);
            await channel.send({ embeds: [embed] });
            return message.reply(`✅ Changelog for **v${LATEST.version}** posted in ${channel}.`);
        }

        if (sub === "version") {
            const ver = args[1]?.trim().toLowerCase().replace(/^v/, "");
            if (!ver) return message.reply("Usage: `changelog version <ver>` e.g. `changelog version 2.1`");
            const entry = CHANGELOG.find((v) => v.version === ver);
            if (!entry) {
                const available = CHANGELOG.map((v) => `v${v.version}`).join(", ");
                return message.reply(`❌ Version \`v${ver}\` not found. Available: ${available}`);
            }
            return message.channel.send({ embeds: [buildChangelogEmbed(entry)] });
        }

        return message.reply("Usage: `changelog [latest|list|announce [#channel]|version <ver>]`");
    },
};
