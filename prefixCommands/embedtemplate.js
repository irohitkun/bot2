import { EmbedBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { getTemplate, listTemplates, deleteTemplate, buildEmbedFromTemplate } from "../utils/embedTemplates.js";

export const command = {
    name: "embedtemplate",
    aliases: ["et"],
    description: "Manage embed templates. Subcommands: list, preview, delete",
    async execute(message, args) {
        const sub = args[0]?.toLowerCase();
        const guildId = message.guild.id;
        const { color } = await getGuildStyle(guildId);

        if (!sub || sub === "list") {
            const templates = await listTemplates(guildId);
            if (templates.length === 0) {
                return message.reply("No embed templates yet. Use `/embedtemplate create` (slash command) to create one.");
            }
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`📋 Embed Templates (${templates.length})`)
                .setDescription(
                    templates.map((t) => `\`${t.name}\` — ${t.title ? `"${t.title.slice(0, 40)}"` : "_(no title)_"}`).join("\n")
                )
                .setFooter({ text: "Use /embedtemplate preview <name> to preview any template" })
                .setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        if (sub === "preview") {
            const name = args[1]?.toLowerCase();
            if (!name) return message.reply("Usage: `embedtemplate preview <name>`");
            const template = await getTemplate(guildId, name);
            if (!template) return message.reply(`❌ No template named \`${name}\` found.`);
            const { color: fallbackColor } = await getGuildStyle(guildId);
            const vars = {
                userMention: message.author.toString(),
                userName: message.author.username,
                userTag: message.author.tag,
                userAvatar: message.author.displayAvatarURL({ size: 256 }),
                serverName: message.guild.name,
                serverIcon: message.guild.iconURL({ size: 256 }) ?? "",
                count: message.guild.memberCount,
            };
            const embed = buildEmbedFromTemplate(template, vars, fallbackColor);
            return message.channel.send({ content: `📋 Preview of \`${name}\`:`, embeds: [embed] });
        }

        if (sub === "delete") {
            if (!message.member.permissions.has("ManageMessages")) {
                return message.reply("❌ You need Manage Messages permission to delete templates.");
            }
            const name = args[1]?.toLowerCase();
            if (!name) return message.reply("Usage: `embedtemplate delete <name>`");
            const deleted = await deleteTemplate(guildId, name);
            return message.reply(deleted ? `🗑️ Template \`${name}\` deleted.` : `❌ No template named \`${name}\` found.`);
        }

        return message.reply("Usage: `embedtemplate [list|preview <name>|delete <name>]`\nTo create or edit templates, use the `/embedtemplate` slash command.");
    },
};
