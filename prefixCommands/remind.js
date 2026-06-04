import { EmbedBuilder } from "discord.js";
import { db, remindersTable } from "../db/index.js";
import { parseDuration, autoDeleteReply, fmtUsage } from "./index.js";

export const command = {
    name: "remind",
    aliases: ["r", "reminder", "remindme"],
    usage: "%remind <time> <message>",
    description: "Set a reminder",
    async execute(message, args) {
        const timeStr = args.shift();
        const reminderText = args.join(" ").trim();

        if (!timeStr || !reminderText) {
            return void autoDeleteReply(message, `Usage: \`${fmtUsage(this.usage, message)}\` — e.g. \`${message._prefix ?? "%"}remind 10m Buy groceries\``);
        }

        const ms = parseDuration(timeStr);
        if (!ms) {
            return void autoDeleteReply(message, "❌ Invalid time format. Use `10m`, `2h`, `1d`, etc.");
        }
        if (ms > 30 * 24 * 3600000) {
            return void autoDeleteReply(message, "❌ Reminder cannot be more than 30 days.");
        }

        const remindAt = new Date(Date.now() + ms);
        const [inserted] = await db.insert(remindersTable).values({
            userId: message.author.id,
            channelId: message.channel.id,
            message: reminderText,
            remindAt,
        }).returning();

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("⏰ Reminder Set")
            .setDescription(`I'll remind you about: **${reminderText}**\n\n⏱️ <t:${Math.floor(remindAt.getTime() / 1000)}:R>\nID: \`${inserted.id}\``)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        // Delivery is handled by the global reminder poller in events/ready.js.
    },
};
