import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import { db, aiAssistantLogsTable } from "../db/index.js";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";

export const data = new SlashCommandBuilder()
    .setName("ailog")
    .setDescription("View recent AI Assistant runs (premium audit log)")
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

    const rows = await fetchLogs({ guildId: interaction.guild.id, userId: user?.id, limit });
    if (rows === null) {
        return interaction.editReply({ content: "❌ The AI audit log table doesn't exist in the database yet. Run `npm run db:push` on your server to create it." });
    }
    return interaction.editReply(buildLogEmbed(rows, user));
}

/** Shared log fetcher — returns null if table does not exist, array otherwise. */
export async function fetchLogs({ guildId, userId, limit = 5 }) {
    try {
        const condition = userId
            ? and(eq(aiAssistantLogsTable.guildId, guildId), eq(aiAssistantLogsTable.userId, userId))
            : eq(aiAssistantLogsTable.guildId, guildId);
        return await db
            .select()
            .from(aiAssistantLogsTable)
            .where(condition)
            .orderBy(desc(aiAssistantLogsTable.createdAt))
            .limit(limit);
    } catch (err) {
        // 42P01 = undefined_table — table hasn't been created yet
        if (err?.code === "42P01" || String(err?.message ?? "").includes("ai_assistant_logs")) {
            return null;
        }
        throw err;
    }
}

/** Build the reply payload (embed) from a set of log rows. */
export function buildLogEmbed(rows, user) {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🤖 AI Assistant — Audit Log${user ? ` · ${user.tag}` : ""}`)
        .setTimestamp();

    if (rows.length === 0) {
        embed.setDescription("No AI Assistant runs recorded yet. Runs are logged the moment they execute or are cancelled.");
        return { embeds: [embed] };
    }

    embed.setDescription(`Showing **${rows.length}** most recent run(s). Status key: ✅ executed · 🚫 cancelled · ⏱️ expired · ❌ error`);

    for (const row of rows) {
        const ts = `<t:${Math.floor(row.createdAt.getTime() / 1000)}:R>`;
        const icon = row.status === "executed" ? "✅" : row.status === "cancelled" ? "🚫" : row.status === "expired" ? "⏱️" : "❌";
        const counts = row.status === "executed" ? ` · ${row.succeeded} ok / ${row.failed} failed` : "";
        const prompt = row.prompt.length > 180 ? row.prompt.slice(0, 177) + "…" : row.prompt;
        const summary = row.planSummary ? (row.planSummary.length > 200 ? row.planSummary.slice(0, 197) + "…" : row.planSummary) : "";
        embed.addFields({
            name: `#${row.id} · <@${row.userId}> · ${ts}`,
            value: `${icon} **${row.status}**${counts}\n> ${prompt}${summary ? `\n${summary}` : ""}`,
        });
    }

    return { embeds: [embed] };
}
