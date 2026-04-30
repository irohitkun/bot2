import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import { db, aiAssistantLogsTable } from "../db/index.js";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";

export const data = new SlashCommandBuilder()
    .setName("ailog")
    .setDescription("View recent AI Assistant runs (audit log)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((opt) =>
        opt.setName("limit")
            .setDescription("How many recent entries to show (1-15, default 5)")
            .setMinValue(1)
            .setMaxValue(15)
            .setRequired(false))
    .addUserOption((opt) =>
        opt.setName("user")
            .setDescription("Only show runs by this user")
            .setRequired(false));

export async function execute(interaction) {
    if (!(await isPremiumGuild(interaction.guild.id))) {
        return interaction.reply({ embeds: [premiumDeniedEmbed("AI Assistant Audit Log")], flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    const limit = interaction.options.getInteger("limit") ?? 5;
    const user = interaction.options.getUser("user");
    const where = user
        ? and(eq(aiAssistantLogsTable.guildId, interaction.guild.id), eq(aiAssistantLogsTable.userId, user.id))
        : eq(aiAssistantLogsTable.guildId, interaction.guild.id);
    const rows = await db.select().from(aiAssistantLogsTable).where(where).orderBy(desc(aiAssistantLogsTable.createdAt)).limit(limit);
    return interaction.editReply(buildLogReply(interaction.guild, rows, user));
}

export function buildLogReply(guild, rows, user) {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🤖 AI Assistant — Audit Log${user ? ` for ${user.tag}` : ""}`)
        .setTimestamp();
    if (rows.length === 0) {
        embed.setDescription("No AI Assistant runs recorded yet.");
        return { embeds: [embed] };
    }
    embed.setDescription(`Showing **${rows.length}** most recent run(s).`);
    for (const row of rows) {
        const ts = `<t:${Math.floor(row.createdAt.getTime() / 1000)}:R>`;
        const status = row.status === "executed" ? `✅ ${row.succeeded} ok / ${row.failed} failed` : `🚫 ${row.status}`;
        const prompt = row.prompt.length > 200 ? row.prompt.slice(0, 197) + "…" : row.prompt;
        embed.addFields({
            name: `#${row.id} • ${row.userTag} • ${ts}`,
            value: `**Status:** ${status}\n**Prompt:** ${prompt}\n**Summary:** ${(row.planSummary ?? "(none)").slice(0, 300)}`,
        });
    }
    return { embeds: [embed] };
}
