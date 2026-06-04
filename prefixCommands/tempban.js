import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention, autoDeleteReply, fmtUsage } from "./index.js";
import { db, tempBansTable } from "../db/index.js";
import { parseDuration, formatDuration } from "../utils/parseDuration.js";
import { scheduleUnban } from "../utils/tempBanScheduler.js";
import { sendModLog } from "../utils/modLog.js";

export const command = {
    name: "tempban",
    aliases: ["tb"],
    usage: "%tempban <@user> <duration> [reason]",
    description: "Temporarily ban a member (e.g. %tempban @user 7d spamming)",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.BanMembers))
            return void autoDeleteReply(message, "❌ You need **Ban Members** permission.");
        if (!args[0] || !args[1])
            return void autoDeleteReply(message, `Usage: \`${fmtUsage(this.usage, message)}\``);

        const userId = parseMention(args[0]) ?? args[0];
        const durationStr = args[1];
        const reason = args.slice(2).join(" ") || "No reason provided";

        const ms = parseDuration(durationStr);
        if (!ms || ms < 60_000)
            return void autoDeleteReply(message, "❌ Invalid duration. Examples: `1h`, `12h`, `7d`, `2w`. Minimum: 1 minute.");
        if (ms > 365 * 24 * 60 * 60 * 1000)
            return void autoDeleteReply(message, "❌ Maximum duration is 1 year.");

        const guild = message.guild;
        const target = await guild.client.users.fetch(userId).catch(() => null);
        if (!target)
            return void autoDeleteReply(message, "❌ Could not find that user.");

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
            if (!member.bannable)
                return void autoDeleteReply(message, "❌ I cannot ban this user (higher role or server owner).");
            if (member.id === message.author.id)
                return void autoDeleteReply(message, "❌ You cannot ban yourself.");
        }

        const label = formatDuration(ms);
        const unbanAt = new Date(Date.now() + ms);

        await guild.members.ban(userId, {
            reason: `[TempBan: ${label}] ${reason} — by ${message.author.tag}`,
        });

        const [row] = await db.insert(tempBansTable).values({
            guildId: guild.id,
            userId: target.id,
            userTag: target.tag,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag,
            reason,
            unbanAt,
        }).returning();

        scheduleUnban(guild.client, row, ms);

        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("⏰ Member Temporarily Banned")
            .addFields(
                { name: "User", value: `${target.tag} (${target.id})`, inline: true },
                { name: "Moderator", value: message.author.tag, inline: true },
                { name: "Duration", value: label, inline: true },
                { name: "Reason", value: reason },
                { name: "Auto-unban", value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:F>` },
            )
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp();
        await message.reply({ embeds: [embed] });

        await sendModLog(guild, new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("⏰ Temporary Ban Issued")
            .addFields(
                { name: "User", value: `${target.tag} (${target.id})`, inline: true },
                { name: "Moderator", value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: "Duration", value: label, inline: true },
                { name: "Reason", value: reason },
                { name: "Expires", value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:F>` },
            )
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp()
        );
    },
};
