import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";

export const command = {
    name: "inrole",
    aliases: ["members", "rolemembers"],
    usage: "%inrole <@role|role-id|role-name>",
    description: "List all members who have a specific role",
    async execute(message, args) {
        if (!args[0]) return void message.reply(`Usage: \`${this.usage}\``);

        const guild = message.guild;
        await guild.members.fetch(); // ensure cache is populated

        // Resolve role by mention, ID, or name
        const roleIdFromMention = parseMention(args[0])?.replace(/[^0-9]/g, "");
        const searchTerm = args.join(" ").toLowerCase();

        const role =
            (roleIdFromMention && guild.roles.cache.get(roleIdFromMention)) ||
            guild.roles.cache.get(args[0]) ||
            guild.roles.cache.find((r) => r.name.toLowerCase() === searchTerm) ||
            guild.roles.cache.find((r) => r.name.toLowerCase().includes(searchTerm));

        if (!role) return void message.reply("❌ Role not found. Use a mention, ID, or exact name.");

        const members = role.members.map((m) => `${m.user.username}${m.nickname ? ` (${m.nickname})` : ""}`);

        if (members.length === 0) {
            return void message.reply({ embeds: [
                new EmbedBuilder().setColor(0x5865f2)
                    .setTitle(`👥 Members in @${role.name}`)
                    .setDescription("*No members have this role.*")
                    .setTimestamp(),
            ] });
        }

        const PAGE = 30;
        const pages = [];
        for (let i = 0; i < members.length; i += PAGE) {
            pages.push(members.slice(i, i + PAGE));
        }

        // Show first page; mention count if more
        const desc = pages[0].map((name, i) => `\`${i + 1}.\` ${name}`).join("\n");
        const embed = new EmbedBuilder()
            .setColor(role.color || 0x5865f2)
            .setTitle(`👥 Members in @${role.name}`)
            .setDescription(desc)
            .setFooter({ text: `${members.length} member${members.length !== 1 ? "s" : ""} total${pages.length > 1 ? ` · Page 1/${pages.length} — run again with more specificity or use /role members` : ""}` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },
};
