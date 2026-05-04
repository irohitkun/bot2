import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
import { db, tempBansTable } from "../db/index.js";
import { parseDuration, formatDuration } from "../utils/parseDuration.js";
import { scheduleUnban } from "../utils/tempBanScheduler.js";
import { sendModLog } from "../utils/modLog.js";

export const command = {
    name: "tempban",
    usage: "%tempban <@user> <duration> [reason]",
    description: "Temporarily ban a member (e.g. %tempban @user 7d spamming)",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.BanMembers)) {
            return void message.reply("❌ You need **Ban Members** permission.");
        }
        if (!args[0] || !args[1]) return void message.reply(`Usage: \`${this.usage}\``);

        const userId = parseMention(args[0]) ?? args[0];
        const durationStr = args[1];
        const reason = args.slice(2).join(" ") || "No reason provided";

        const ms = parseDuration(durationStr);
        if (!ms || ms < 60_000) return void message.reply("❌ Invalid duration. Examples: `1h`, `12h`, `7d`, `2w`. Minimum: 1 minute.");
        if (ms > 365 * 24 * 60 * 60 * 1000) return void message.reply("❌ Maximum duration is 1 year.");

        const guild = message.guild;
        const target = await guild.client.users.fetch(userId).catch(() => null);
        if (!target) return void message.reply("❌ Could not find that user.");

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
            if (!member.bannable) return void message.reply("❌ I cannot ban this user (higher role or server owner).");
            if (member.id === message.author.id) return void message.reply("❌ You cannot ban yourself.");
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
