import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, remindersTable } from "../db/index.js";
import { eq, and, asc } from "drizzle-orm";
import { parseDuration } from "../utils/duration.js";

const MAX_REMIND_MS = 30 * 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Manage your reminders")
    .addSubcommand((sub) => sub.setName("set").setDescription("Set a reminder")
        .addStringOption((o) => o.setName("time").setDescription("When to remind you (e.g. 10m, 2h, 1d12h, max 30d)").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("What to remind you about").setRequired(true).setMaxLength(500)))
    .addSubcommand((sub) => sub.setName("list").setDescription("List your pending reminders"))
    .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel a pending reminder")
        .addIntegerOption((o) => o.setName("id").setDescription("Reminder ID (from /remind list)").setRequired(true)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "set") {
        const timeStr = interaction.options.getString("time", true);
        const messageText = interaction.options.getString("message", true);

        const ms = parseDuration(timeStr);
        if (!ms) return interaction.reply({ content: "❌ Invalid time format. Use formats like `10m`, `2h`, `1d12h`.", flags: 64 });
        if (ms > MAX_REMIND_MS) return interaction.reply({ content: "❌ Reminder cannot be more than 30 days.", flags: 64 });

        const remindAt = new Date(Date.now() + ms);
        const [inserted] = await db.insert(remindersTable).values({
            userId,
            channelId: interaction.channelId,
            message: messageText,
            remindAt,
        }).returning();

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("⏰ Reminder Set")
            .setDescription(`I'll remind you about: **${messageText}**\n\n⏱️ <t:${Math.floor(remindAt.getTime() / 1000)}:R>\n\nReminder ID: \`${inserted.id}\``)
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
        // Delivery is handled by the global reminder poller in events/ready.js.
    }

    if (sub === "list") {
        const rows = await db.select().from(remindersTable)
            .where(and(eq(remindersTable.userId, userId), eq(remindersTable.sent, false)))
            .orderBy(asc(remindersTable.remindAt));
        if (rows.length === 0) return interaction.reply({ content: "📭 You have no pending reminders.", flags: 64 });

        const lines = rows.slice(0, 25).map((r) => {
            const preview = r.message.length > 80 ? r.message.slice(0, 77) + "…" : r.message;
            return `\`#${r.id}\` <t:${Math.floor(r.remindAt.getTime() / 1000)}:R> — ${preview}`;
        });
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`⏰ Your Reminders (${rows.length})`)
            .setDescription(lines.join("\n").slice(0, 4000))
            .setFooter({ text: "Cancel with /remind cancel id:<id>" })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "cancel") {
        const id = interaction.options.getInteger("id", true);
        const [row] = await db.select().from(remindersTable)
            .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId), eq(remindersTable.sent, false)));
        if (!row) return interaction.reply({ content: "❌ No pending reminder found with that ID (make sure it's yours).", flags: 64 });

        await db.delete(remindersTable).where(eq(remindersTable.id, id));
        return interaction.reply({ content: `✅ Reminder \`#${id}\` cancelled.`, flags: 64 });
    }
}
