import { EmbedBuilder } from "discord.js";
import { db, memberStatsTable } from "../db/index.js";
import { and, desc, eq } from "drizzle-orm";
import { parseMention } from "./index.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const command = {
    name: "msgcount",
    aliases: ["mc", "messages", "msgs"],
    usage: "%msgcount [@user]  or  %msgcount top [limit]",
    description: "View message counts or the server message leaderboard",
    async execute(message, args) {
        const guildId = message.guild.id;
        const { color } = await getGuildStyle(guildId);

        // %msgcount top [limit]
        if (args[0]?.toLowerCase() === "top" || args[0]?.toLowerCase() === "lb") {
            const limit = Math.min(25, Math.max(1, parseInt(args[1], 10) || 10));
            const rows = await db.select()
                .from(memberStatsTable)
                .where(eq(memberStatsTable.guildId, guildId))
                .orderBy(desc(memberStatsTable.messageCount))
                .limit(limit);

            if (rows.length === 0)
                return void message.reply("📭 No message data yet for this server.");

            const lines = rows.map((row, i) =>
                `**#${i + 1}** ${row.userTag} — \`${(row.messageCount ?? 0).toLocaleString()}\` messages`
            );
            return void message.reply({ embeds: [new EmbedBuilder()
                .setColor(color)
                .setTitle(`💬 Message Leaderboard — Top ${rows.length}`)
                .setDescription(lines.join("\n"))
                .setTimestamp()] });
        }

        // %msgcount [@user]
        const targetId = args[0] ? (parseMention(args[0]) ?? args[0]) : message.author.id;
        const target = await message.client.users.fetch(targetId).catch(() => null);
        if (!target) return void message.reply("❌ User not found.");

        const [stats] = await db.select()
            .from(memberStatsTable)
            .where(and(eq(memberStatsTable.guildId, guildId), eq(memberStatsTable.userId, targetId)));

        const count = stats?.messageCount ?? 0;

        const allRows = await db.select({ userId: memberStatsTable.userId, mc: memberStatsTable.messageCount })
            .from(memberStatsTable)
            .where(eq(memberStatsTable.guildId, guildId))
            .orderBy(desc(memberStatsTable.messageCount));
        const rank = allRows.findIndex((r) => r.userId === targetId) + 1 || allRows.length + 1;

        return void message.reply({ embeds: [new EmbedBuilder()
            .setColor(color)
            .setTitle(`💬 Message Count — ${target.username}`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "Messages Sent", value: count.toLocaleString(), inline: true },
                { name: "Server Rank", value: `#${rank}`, inline: true },
            )
            .setFooter({ text: "Counts messages sent since the tracker was enabled" })
            .setTimestamp()] });
    },
};
