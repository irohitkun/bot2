import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, memberStatsTable } from "../db/index.js";
import { and, desc, eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("msgcount")
    .setDescription("View message counts for this server")
    .addSubcommand((sub) =>
        sub.setName("user")
            .setDescription("Check message count for a user")
            .addUserOption((o) => o.setName("target").setDescription("User to check (defaults to you)").setRequired(false))
    )
    .addSubcommand((sub) =>
        sub.setName("leaderboard")
            .setDescription("Top message senders in this server")
            .addIntegerOption((o) => o.setName("limit").setDescription("How many to show (default 10, max 25)").setMinValue(1).setMaxValue(25).setRequired(false))
    );

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const { color } = await getGuildStyle(guildId);

    if (sub === "user") {
        const target = interaction.options.getUser("target") ?? interaction.user;
        const [stats] = await db.select()
            .from(memberStatsTable)
            .where(and(eq(memberStatsTable.guildId, guildId), eq(memberStatsTable.userId, target.id)));

        const count = stats?.messageCount ?? 0;

        // Rank by message count
        const allRows = await db.select({ userId: memberStatsTable.userId, mc: memberStatsTable.messageCount })
            .from(memberStatsTable)
            .where(eq(memberStatsTable.guildId, guildId))
            .orderBy(desc(memberStatsTable.messageCount));
        const rank = allRows.findIndex((r) => r.userId === target.id) + 1 || allRows.length + 1;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`💬 Message Count — ${target.username}`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "Messages Sent", value: count.toLocaleString(), inline: true },
                { name: "Server Rank", value: `#${rank}`, inline: true },
            )
            .setFooter({ text: "Counts messages sent since the tracker was enabled" })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    if (sub === "leaderboard") {
        const limit = interaction.options.getInteger("limit") ?? 10;
        const rows = await db.select()
            .from(memberStatsTable)
            .where(eq(memberStatsTable.guildId, guildId))
            .orderBy(desc(memberStatsTable.messageCount))
            .limit(limit);

        if (rows.length === 0)
            return interaction.reply({ content: "📭 No message data yet for this server.", flags: 64 });

        const lines = rows.map((row, i) =>
            `**#${i + 1}** ${row.userTag} — \`${(row.messageCount ?? 0).toLocaleString()}\` messages`
        );

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`💬 Message Leaderboard — Top ${rows.length}`)
            .setDescription(lines.join("\n"))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
}
