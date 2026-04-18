import { EmbedBuilder } from "discord.js";
import { parseMention } from "./index.js";
export const command = {
    name: "role",
    usage: "%role <add|remove> <@user> <@role>",
    description: "Add or remove a role from a user",
    async execute(message, args) {
        if (args.length < 3)
            return void message.reply(`Usage: \`${this.usage}\``);
        if (!message.member?.permissions.has("ManageRoles"))
            return void message.reply("❌ You need **Manage Roles** permission.");
        const sub = args[0].toLowerCase();
        if (sub !== "add" && sub !== "remove")
            return void message.reply(`Usage: \`${this.usage}\``);
        const userId = parseMention(args[1]) ?? args[1];
        const roleId = parseMention(args[2]) ?? args[2];
        const member = await message.guild.members.fetch(userId).catch(() => null);
        const role = await message.guild.roles.fetch(roleId).catch(() => null);
        if (!member)
            return void message.reply("❌ Could not find that member.");
        if (!role)
            return void message.reply("❌ Could not find that role.");
        const botMember = message.guild.members.me;
        if (role.position >= botMember.roles.highest.position)
            return void message.reply("❌ That role is higher than my highest role.");
        if (sub === "add") {
            await member.roles.add(role);
            const embed = new EmbedBuilder().setColor(0x57f287).setTitle("✅ Role Added")
                .addFields({ name: "User", value: member.user.tag, inline: true }, { name: "Role", value: role.name, inline: true }).setTimestamp();
            return void message.reply({ embeds: [embed] });
        }
        if (sub === "remove") {
            await member.roles.remove(role);
            const embed = new EmbedBuilder().setColor(0xed4245).setTitle("✅ Role Removed")
                .addFields({ name: "User", value: member.user.tag, inline: true }, { name: "Role", value: role.name, inline: true }).setTimestamp();
            return void message.reply({ embeds: [embed] });
        }
    },
};
