import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
export const command = {
    name: "unmute",
    usage: "%unmute @user [reason]",
    description: "Remove timeout from a member",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return void message.reply("❌ You don't have permission to unmute members.");
        }
        if (!args[0])
            return void message.reply(`Usage: \`${this.usage}\``);
        const userId = parseMention(args[0]) ?? args[0];
        const reason = args.slice(1).join(" ") || "No reason provided";
        const guild = message.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member)
            return void message.reply("❌ Could not find that member.");
        if (!member.isCommunicationDisabled())
            return void message.reply("❌ This user is not muted.");
        await member.timeout(null, reason);
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("🔊 Member Unmuted")
            .addFields({ name: "User", value: `${member.user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Reason", value: reason })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
