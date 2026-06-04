import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention, autoDeleteReply, fmtUsage } from "./index.js";
export const command = {
    name: "unmute",
    aliases: ["um", "untimeout"],
    usage: "%unmute @user [reason]",
    description: "Remove timeout from a member",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers))
            return void autoDeleteReply(message, "❌ You don't have permission to unmute members.");
        if (!args[0])
            return void autoDeleteReply(message, `Usage: \`${fmtUsage(this.usage, message)}\``);
        const userId = parseMention(args[0]) ?? args[0];
        const reason = args.slice(1).join(" ") || "No reason provided";
        const guild = message.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member)
            return void autoDeleteReply(message, "❌ Could not find that member.");
        if (!member.isCommunicationDisabled())
            return void autoDeleteReply(message, "❌ This user is not muted.");
        await member.timeout(null, reason);
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("🔊 Member Unmuted")
            .addFields({ name: "User", value: `${member.user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Reason", value: reason })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
