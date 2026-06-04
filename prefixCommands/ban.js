import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention, autoDeleteReply, fmtUsage } from "./index.js";
export const command = {
    name: "ban",
    aliases: ["b"],
    usage: "%ban @user [reason]",
    description: "Ban a member from the server",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.BanMembers))
            return void autoDeleteReply(message, "❌ You don't have permission to ban members.");
        if (!args[0])
            return void autoDeleteReply(message, `Usage: \`${fmtUsage(this.usage, message)}\``);
        const userId = parseMention(args[0]) ?? args[0];
        const reason = args.slice(1).join(" ") || "No reason provided";
        const guild = message.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member)
            return void autoDeleteReply(message, "❌ Could not find that member.");
        if (!member.bannable)
            return void autoDeleteReply(message, "❌ I cannot ban this user.");
        if (member.id === message.author.id)
            return void autoDeleteReply(message, "❌ You cannot ban yourself.");
        await member.ban({ reason });
        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔨 Member Banned")
            .addFields({ name: "User", value: `${member.user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Reason", value: reason })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
