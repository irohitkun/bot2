import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, warningsTable, tempBansTable, memberNotesTable } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("history")
    .setDescription("View the full moderation history for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) => o.setName("user").setDescription("The member to look up").setRequired(true));

export async function execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    const user = interaction.options.getUser("user", true);
    const guildId = interaction.guild.id;
    const { color } = await getGuildStyle(guildId);

    const [warnings, tempBans, notes] = await Promise.all([
        db.select().from(warningsTable)
            .where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, user.id)))
            .orderBy(desc(warningsTable.createdAt)),
        db.select().from(tempBansTable)
            .where(and(eq(tempBansTable.guildId, guildId), eq(tempBansTable.userId, user.id)))
            .orderBy(desc(tempBansTable.bannedAt)),
        db.select().from(memberNotesTable)
            .where(and(eq(memberNotesTable.guildId, guildId), eq(memberNotesTable.userId, user.id)))
            .orderBy(desc(memberNotesTable.createdAt)),
    ]);

    const total = warnings.length + tempBans.length;

    const embed = new EmbedBuilder()
        .setColor(total > 0 ? (total >= 5 ? 0xed4245 : 0xfee75c) : color)
        .setTitle(`📋 Moderation History — ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields({ name: "Summary", value: `⚠️ ${warnings.length} warning(s) · ⏰ ${tempBans.length} temp ban(s) · 📝 ${notes.length} note(s)`, inline: false });

    if (warnings.length > 0) {
        const warnLines = warnings.slice(0, 8).map((w) =>
            `**#${w.id}** <t:${Math.floor(w.createdAt.getTime() / 1000)}:d> by ${w.moderatorTag}\n↳ ${w.reason}`
        );
        if (warnings.length > 8) warnLines.push(`*...and ${warnings.length - 8} more*`);
        embed.addFields({ name: `⚠️ Warnings (${warnings.length})`, value: warnLines.join("\n").slice(0, 1024) });
    }

    if (tempBans.length > 0) {
        const banLines = tempBans.slice(0, 5).map((b) => {
            const status = b.unbanned ? "✅ expired" : `🔴 active — expires <t:${Math.floor(b.unbanAt.getTime() / 1000)}:R>`;
            return `**#${b.id}** <t:${Math.floor(b.bannedAt.getTime() / 1000)}:d> by ${b.moderatorTag} [${status}]\n↳ ${b.reason}`;
        });
        embed.addFields({ name: `⏰ Temp Bans (${tempBans.length})`, value: banLines.join("\n").slice(0, 1024) });
    }

    if (notes.length > 0) {
        const noteLines = notes.slice(0, 5).map((n) =>
            `**#${n.id}** <t:${Math.floor(n.createdAt.getTime() / 1000)}:d> by ${n.authorTag}\n↳ ${n.note}`
        );
        if (notes.length > 5) noteLines.push(`*...and ${notes.length - 5} more — use /note list*`);
        embed.addFields({ name: `📝 Notes (${notes.length})`, value: noteLines.join("\n").slice(0, 1024) });
    }

    if (total === 0 && notes.length === 0) {
        embed.setDescription("✅ No warnings, temp bans, or notes on record for this member.");
    }

    embed.setFooter({ text: `User ID: ${user.id}` }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
}
