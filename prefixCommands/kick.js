import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention, autoDeleteReply, fmtUsage } from "./index.js";
export const command = {
    name: "kick",
    aliases: ["k"],
    usage: "%kick @user [reason]",
    description: "Kick a member from the server",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.KickMembers))
            return void autoDeleteReply(message, "❌ You don't have permission to kick members.");
        if (!args[0])
            return void autoDeleteReply(message, `Usage: \`${fmtUsage(this.usage, message)}\``);
        const userId = parseMention(args[0]) ?? args[0];
        const reason = args.slice(1).join(" ") || "No reason provided";
        const guild = message.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member)
            return void autoDeleteReply(message, "❌ Could not find that member.");
        if (!member.kickable)
            return void autoDeleteReply(message, "❌ I cannot kick this user.");
        if (member.id === message.author.id)
            return void autoDeleteReply(message, "❌ You cannot kick yourself.");
        await member.kick(reason);
        const embed = new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("👟 Member Kicked")
            .addFields({ name: "User", value: `${member.user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Reason", value: reason })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
