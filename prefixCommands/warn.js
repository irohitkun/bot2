import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention, autoDeleteReply, fmtUsage } from "./index.js";
import { db, warningsTable } from "../db/index.js";
import { eq, and, count } from "drizzle-orm";
export const command = {
    name: "warn",
    aliases: ["w"],
    usage: "%warn @user <reason>",
    description: "Warn a member",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers))
            return void autoDeleteReply(message, "❌ You don't have permission to warn members.");
        if (args.length < 2)
            return void autoDeleteReply(message, `Usage: \`${fmtUsage(this.usage, message)}\``);
        const userId = parseMention(args[0]) ?? args[0];
        const reason = args.slice(1).join(" ");
        const guild = message.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member)
            return void autoDeleteReply(message, "❌ Could not find that member.");
        if (member.id === message.author.id)
            return void autoDeleteReply(message, "❌ You cannot warn yourself.");
        await db.insert(warningsTable).values({
            guildId: guild.id,
            userId: member.user.id,
            userTag: member.user.tag,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag,
            reason,
        });
        const [{ value: totalWarnings }] = await db
            .select({ value: count() })
            .from(warningsTable)
            .where(and(eq(warningsTable.guildId, guild.id), eq(warningsTable.userId, member.user.id)));
        try {
            await member.user.send(`⚠️ You have been warned in **${guild.name}** by ${message.author.tag}.\n**Reason:** ${reason}\nYou now have **${totalWarnings}** warning(s).`);
        } catch { }
        const embed = new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("⚠️ Member Warned")
            .addFields({ name: "User", value: `${member.user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Reason", value: reason }, { name: "Total Warnings", value: `${totalWarnings}`, inline: true })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
