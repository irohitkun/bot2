import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, remindersTable } from "../db/index.js";
import { eq, and, asc } from "drizzle-orm";
import { parseDuration } from "../utils/duration.js";

const MAX_TIMER_MS = 30 * 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
    .setName("timer")
    .setDescription("Set a quick countdown timer (no message required)")
    .addSubcommand((sub) => sub.setName("set").setDescription("Start a timer")
        .addStringOption((o) => o.setName("time").setDescription("When to fire (e.g. 25m, 2h, 1d — max 30d)").setRequired(true))
        .addStringOption((o) => o.setName("label").setDescription("Optional label (default: Timer complete!)").setRequired(false).setMaxLength(300)))
    .addSubcommand((sub) => sub.setName("list").setDescription("List your active timers"))
    .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel a timer")
        .addIntegerOption((o) => o.setName("id").setDescription("Timer ID (from /timer list)").setRequired(true)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "set") {
        const timeStr = interaction.options.getString("time", true);
        const label = interaction.options.getString("label") ?? "⏰ Timer complete!";

        const ms = parseDuration(timeStr);
        if (!ms) return interaction.reply({ content: "❌ Invalid time format. Use formats like `10m`, `2h`, `1d12h`.", flags: 64 });
        if (ms > MAX_TIMER_MS) return interaction.reply({ content: "❌ Timer cannot be more than 30 days.", flags: 64 });

        const remindAt = new Date(Date.now() + ms);
        const [inserted] = await db.insert(remindersTable).values({
            userId,
            channelId: interaction.channelId,
            message: label,
            remindAt,
        }).returning();

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⏱️ Timer Started")
            .setDescription(`**${label}**\n\n⏰ Fires <t:${Math.floor(remindAt.getTime() / 1000)}:R>\nID: \`${inserted.id}\``)
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    if (sub === "list") {
        const rows = await db.select().from(remindersTable)
            .where(and(eq(remindersTable.userId, userId), eq(remindersTable.sent, false)))
            .orderBy(asc(remindersTable.remindAt));
        if (rows.length === 0) return interaction.reply({ content: "📭 You have no active timers or reminders.", flags: 64 });

        const lines = rows.slice(0, 25).map((r) => {
            const preview = r.message.length > 80 ? r.message.slice(0, 77) + "…" : r.message;
            return `\`#${r.id}\` <t:${Math.floor(r.remindAt.getTime() / 1000)}:R> — ${preview}`;
        });
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`⏰ Your Timers & Reminders (${rows.length})`)
            .setDescription(lines.join("\n").slice(0, 4000))
            .setFooter({ text: "Cancel with /timer cancel id:<id>" })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "cancel") {
        const id = interaction.options.getInteger("id", true);
        const [row] = await db.select().from(remindersTable)
            .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId), eq(remindersTable.sent, false)));
        if (!row) return interaction.reply({ content: "❌ No active timer/reminder found with that ID (make sure it's yours).", flags: 64 });

        await db.delete(remindersTable).where(eq(remindersTable.id, id));
        return interaction.reply({ content: `✅ Timer \`#${id}\` cancelled.`, flags: 64 });
    }
}
