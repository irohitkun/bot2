import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";

export const command = {
    name: "role",
    usage: "%role <@user|uid> <@role|role-id>",
    description: "Toggle a role on a user — adds if they don't have it, removes if they do",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageRoles))
            return void message.reply("❌ You need **Manage Roles** permission.");

        if (args.length < 2)
            return void message.reply(`Usage: \`${this.usage}\`\nWorks with mentions or raw IDs. Toggles the role — no separate add/remove needed.`);

        // Parentheses required — cannot mix ?? and || without them (JS spec)
        const userId = (parseMention(args[0]) ?? args[0].replace(/\D/g, "")) || args[0];
        const roleId = (parseMention(args[1]) ?? args[1].replace(/[^0-9]/g, "")) || args[1];

        const [member, role] = await Promise.all([
            message.guild.members.fetch(userId).catch(() => null),
            message.guild.roles.fetch(roleId).catch(() => null),
        ]);

        if (!member) return void message.reply("❌ Could not find that member. Use a mention or their user ID.");
        if (!role) return void message.reply("❌ Could not find that role. Use a mention or the role ID.");

        const botMember = message.guild.members.me;
        if (role.position >= botMember.roles.highest.position)
            return void message.reply("❌ That role is higher than or equal to my highest role.");

        const hasRole = member.roles.cache.has(role.id);

        if (hasRole) {
            await member.roles.remove(role, `Role toggled off by ${message.author.tag}`);
            const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("✅ Role Removed")
                .addFields(
                    { name: "User", value: `${member.user.username} (${member.user.id})`, inline: true },
                    { name: "Role", value: `${role.name} (${role.id})`, inline: true },
                    { name: "By", value: message.author.tag, inline: true },
                )
                .setTimestamp();
            return void message.reply({ embeds: [embed] });
        } else {
            await member.roles.add(role, `Role toggled on by ${message.author.tag}`);
            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("✅ Role Added")
                .addFields(
                    { name: "User", value: `${member.user.username} (${member.user.id})`, inline: true },
                    { name: "Role", value: `${role.name} (${role.id})`, inline: true },
                    { name: "By", value: message.author.tag, inline: true },
                )
                .setTimestamp();
            return void message.reply({ embeds: [embed] });
        }
    },
};
