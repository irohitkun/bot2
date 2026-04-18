import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
export const command = {
    name: "kick",
    usage: "%kick @user [reason]",
    description: "Kick a member from the server",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.KickMembers)) {
            return void message.reply("❌ You don't have permission to kick members.");
        }
        if (!args[0])
            return void message.reply(`Usage: \`${this.usage}\``);
        const userId = parseMention(args[0]) ?? args[0];
        const reason = args.slice(1).join(" ") || "No reason provided";
        const guild = message.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member)
            return void message.reply("❌ Could not find that member.");
        if (!member.kickable)
            return void message.reply("❌ I cannot kick this user.");
        if (member.id === message.author.id)
            return void message.reply("❌ You cannot kick yourself.");
        await member.kick(reason);
        const embed = new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("👟 Member Kicked")
            .addFields({ name: "User", value: `${member.user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Reason", value: reason })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
