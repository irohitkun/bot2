import { EmbedBuilder } from "discord.js";
import { db, remindersTable } from "../db/index.js";
import { eq, and, asc } from "drizzle-orm";
import { parseDuration } from "../utils/duration.js";

const MAX_REMIND_MS = 30 * 24 * 60 * 60 * 1000;

export const command = {
    name: "remind",
    usage: "%remind <set <time> <message> | list | cancel <id>>",
    description: "Set, list, or cancel reminders",
    async execute(message, args) {
        const sub = args[0]?.toLowerCase();
        const userId = message.author.id;

        // Backward-compat: `%remind 10m do the thing` is equivalent to `%remind set ...`
        const looksLikeShortcut = sub && !["set", "list", "cancel"].includes(sub) && parseDuration(sub) !== null;
        const effectiveSub = looksLikeShortcut ? "set" : sub;
        const subArgs = looksLikeShortcut ? args : args.slice(1);

        if (effectiveSub === "set") {
            const timeStr = subArgs[0];
            const reminderText = subArgs.slice(1).join(" ").trim();
            if (!timeStr || !reminderText)
                return message.reply(`Usage: \`${this.usage}\``);

            const ms = parseDuration(timeStr);
            if (!ms) return message.reply("❌ Invalid time format. Use formats like `10m`, `2h`, `1d12h`.");
            if (ms > MAX_REMIND_MS) return message.reply("❌ Reminder cannot be more than 30 days.");

            const remindAt = new Date(Date.now() + ms);
            const [inserted] = await db.insert(remindersTable).values({
                userId,
                channelId: message.channel.id,
                message: reminderText,
                remindAt,
            }).returning();

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("⏰ Reminder Set")
                .setDescription(`I'll remind you about: **${reminderText}**\n\n⏱️ <t:${Math.floor(remindAt.getTime() / 1000)}:R>\n\nReminder ID: \`${inserted.id}\``)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
            // Delivery is handled by the global reminder poller in events/ready.js.
        }

        if (effectiveSub === "list") {
            const rows = await db.select().from(remindersTable)
                .where(and(eq(remindersTable.userId, userId), eq(remindersTable.sent, false)))
                .orderBy(asc(remindersTable.remindAt));
            if (rows.length === 0) return message.reply("📭 You have no pending reminders.");

            const lines = rows.slice(0, 25).map((r) => {
                const preview = r.message.length > 80 ? r.message.slice(0, 77) + "…" : r.message;
                return `\`#${r.id}\` <t:${Math.floor(r.remindAt.getTime() / 1000)}:R> — ${preview}`;
            });
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`⏰ Your Reminders (${rows.length})`)
                .setDescription(lines.join("\n").slice(0, 4000))
                .setFooter({ text: "Cancel with %remind cancel <id>" })
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        if (effectiveSub === "cancel") {
            const id = parseInt(subArgs[0], 10);
            if (!id) return message.reply("Usage: `%remind cancel <id>`");
            const [row] = await db.select().from(remindersTable)
                .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId), eq(remindersTable.sent, false)));
            if (!row) return message.reply("❌ No pending reminder found with that ID (make sure it's yours).");

            await db.delete(remindersTable).where(eq(remindersTable.id, id));
            return message.reply(`✅ Reminder \`#${id}\` cancelled.`);
        }

        return message.reply(`Usage: \`${this.usage}\``);
    },
};
