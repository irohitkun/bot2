import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention, parseDuration } from "./index.js";
export const command = {
    name: "mute",
    usage: "%mute @user <duration> [reason]",
    description: "Timeout (mute) a member",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return void message.reply("❌ You don't have permission to mute members.");
        }
        if (args.length < 2)
            return void message.reply(`Usage: \`${this.usage}\` — e.g. \`%mute @user 10m spamming\``);
        const userId = parseMention(args[0]) ?? args[0];
        const durationInput = args[1];
        const reason = args.slice(2).join(" ") || "No reason provided";
        const durationMs = parseDuration(durationInput);
        if (!durationMs)
            return void message.reply("❌ Invalid duration. Use formats like `10m`, `1h`, `2d`.");
        const maxMs = 28 * 24 * 60 * 60 * 1000;
        if (durationMs > maxMs)
            return void message.reply("❌ Duration cannot exceed 28 days.");
        const guild = message.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member)
            return void message.reply("❌ Could not find that member.");
        if (!member.moderatable)
            return void message.reply("❌ I cannot mute this user.");
        if (member.id === message.author.id)
            return void message.reply("❌ You cannot mute yourself.");
        await member.timeout(durationMs, reason);
        const until = new Date(Date.now() + durationMs);
        const embed = new EmbedBuilder()
            .setColor(0xf47b67)
            .setTitle("🔇 Member Muted")
            .addFields({ name: "User", value: `${member.user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Duration", value: durationInput, inline: true }, { name: "Expires", value: `<t:${Math.floor(until.getTime() / 1000)}:R>`, inline: true }, { name: "Reason", value: reason })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
