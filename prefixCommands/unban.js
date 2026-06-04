import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { autoDeleteReply, fmtUsage } from "./index.js";
export const command = {
    name: "unban",
    aliases: ["ub"],
    usage: "%unban <userID> [reason]",
    description: "Unban a user by ID",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.BanMembers))
            return void autoDeleteReply(message, "❌ You don't have permission to unban members.");
        if (!args[0])
            return void autoDeleteReply(message, `Usage: \`${fmtUsage(this.usage, message)}\``);
        const userId = args[0].trim();
        const reason = args.slice(1).join(" ") || "No reason provided";
        const guild = message.guild;
        const ban = await guild.bans.fetch(userId).catch(() => null);
        if (!ban)
            return void autoDeleteReply(message, "❌ This user is not banned or the ID is invalid.");
        await guild.bans.remove(userId, reason);
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Member Unbanned")
            .addFields({ name: "User", value: `${ban.user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Reason", value: reason })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
