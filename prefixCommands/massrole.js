import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";

export const command = {
    name: "massrole",
    usage: "%massrole <add|remove> <@role|roleID> <everyone|humans|bots>",
    description: "Add or remove a role from everyone, humans only, or bots only",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return void message.reply("❌ You need **Manage Roles** permission.");
        }

        const action = args[0]?.toLowerCase();
        if (!["add", "remove"].includes(action)) {
            return void message.reply(`Usage: \`${this.usage}\`\nExamples:\n\`%massrole add @Member everyone\`\n\`%massrole remove @Bots bots\`\n\`%massrole add @Verified humans\``);
        }

        const roleInput = args[1];
        const targetInput = args[2]?.toLowerCase();

        if (!roleInput) return void message.reply("❌ Please provide a role to add/remove.");
        if (!["everyone", "humans", "bots"].includes(targetInput)) {
            return void message.reply("❌ Target must be `everyone`, `humans`, or `bots`.");
        }

        const roleId = parseMention(roleInput) ?? roleInput;
        const role = message.guild.roles.cache.get(roleId);
        if (!role) return void message.reply("❌ Role not found. Mention the role or provide its ID.");

        const botMember = message.guild.members.me;
        if (role.position >= botMember.roles.highest.position) {
            return void message.reply("❌ That role is higher than or equal to my highest role — I can't assign it.");
        }
        if (role.managed) return void message.reply("❌ That role is managed by an integration and cannot be assigned manually.");
        if (role.id === message.guild.id) return void message.reply("❌ You can't mass-assign the @everyone role.");

        const statusMsg = await message.reply(`⚙️ Working… fetching members and ${action === "add" ? "adding" : "removing"} <@&${role.id}> (target: **${targetInput}**). This may take a while for large servers.`);

        let members;
        try {
            await message.guild.members.fetch();
            members = message.guild.members.cache;
        } catch {
            return void statusMsg.edit("❌ Failed to fetch server members.");
        }

        let filtered;
        if (targetInput === "everyone") filtered = [...members.values()];
        else if (targetInput === "humans") filtered = [...members.values()].filter((m) => !m.user.bot);
        else filtered = [...members.values()].filter((m) => m.user.bot);

        const toProcess = filtered.filter((m) => action === "add" ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id));
        const already = filtered.length - toProcess.length;

        if (toProcess.length === 0) {
            return void statusMsg.edit(`⚠️ All ${filtered.length} matching members already ${action === "add" ? "have" : "don't have"} <@&${role.id}>.`);
        }

        let success = 0;
        let failed = 0;
        const auditReason = `Mass role ${action} by ${message.author.tag} — target: ${targetInput}`;

        for (const member of toProcess) {
            try {
                if (action === "add") await member.roles.add(role.id, auditReason);
                else await member.roles.remove(role.id, auditReason);
                success++;
            } catch {
                failed++;
            }
            if (success % 10 === 0) await new Promise((r) => setTimeout(r, 250));
        }

        const verb = action === "add" ? "Added to" : "Removed from";
        await statusMsg.edit({
            content: "",
            embeds: [new EmbedBuilder()
                .setColor(failed === 0 ? 0x57f287 : 0xfee75c)
                .setTitle(`${action === "add" ? "✅" : "🗑️"} Mass Role — Done`)
                .addFields(
                    { name: "Role", value: `<@&${role.id}>`, inline: true },
                    { name: "Target", value: targetInput, inline: true },
                    { name: `${verb} members`, value: `${success}`, inline: true },
                    { name: "Already done / skipped", value: `${already}`, inline: true },
                    { name: "Failed", value: `${failed}`, inline: true },
                )
                .setFooter({ text: `Executed by ${message.author.tag}` })
                .setTimestamp()],
        });
    },
};
