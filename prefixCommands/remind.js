import { EmbedBuilder } from "discord.js";
import { db, remindersTable } from "../db/index.js";

function parseDuration(input) {
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match)
        return null;
    const value = parseInt(match[1], 10);
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * multipliers[match[2].toLowerCase()];
}

export const command = {
    name: "remind",
    usage: "%remind <time> <message>",
    description: "Create a reminder",
    async execute(message, args) {
        const timeStr = args.shift();
        const reminderText = args.join(" ").trim();

        if (!timeStr || !reminderText) {
            return message.reply(`Usage: \`${this.usage}\``);
        }

        const ms = parseDuration(timeStr);
        if (!ms) {
            return message.reply("❌ Invalid time format. Use formats like `10m`, `2h`, or `1d`.");
        }

        if (ms > 30 * 24 * 3600000) {
            return message.reply("❌ Reminder cannot be more than 30 days.");
        }

        const remindAt = new Date(Date.now() + ms);
        await db.insert(remindersTable).values({
            userId: message.author.id,
            channelId: message.channel.id,
            message: reminderText,
            remindAt,
        });

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("⏰ Reminder Set")
            .setDescription(`I'll remind you about: **${reminderText}**\n\n⏱️ <t:${Math.floor(remindAt.getTime() / 1000)}:R>`)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        // Delivery is handled by the global reminder poller in events/ready.js
        // (no in-process setTimeout — that would silently truncate >24.8d delays
        // and would not survive a bot restart).
    },
};