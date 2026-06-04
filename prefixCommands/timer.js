import { EmbedBuilder } from "discord.js";
import { db, remindersTable } from "../db/index.js";
import { parseDuration, autoDeleteReply, fmtUsage } from "./index.js";

export const command = {
    name: "timer",
    aliases: ["t"],
    usage: "%timer <time> [label]",
    description: "Set a quick countdown timer (label is optional)",
    async execute(message, args) {
        const timeStr = args.shift();

        if (!timeStr) {
            return void autoDeleteReply(message, `Usage: \`${fmtUsage(this.usage, message)}\` — e.g. \`${message._prefix ?? "%"}timer 25m Pomodoro\``);
        }

        const ms = parseDuration(timeStr);
        if (!ms) {
            return void autoDeleteReply(message, "❌ Invalid time format. Use `10m`, `2h`, `1d`, etc.");
        }
        if (ms > 30 * 24 * 3600000) {
            return void autoDeleteReply(message, "❌ Timer cannot be more than 30 days.");
        }

        const label = args.join(" ").trim() || "⏰ Timer complete!";
        const remindAt = new Date(Date.now() + ms);

        const [inserted] = await db.insert(remindersTable).values({
            userId: message.author.id,
            channelId: message.channel.id,
            message: label,
            remindAt,
        }).returning();

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⏱️ Timer Started")
            .setDescription(`**${label}**\n\n⏰ Fires <t:${Math.floor(remindAt.getTime() / 1000)}:R>\nID: \`${inserted.id}\``)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        // Delivery is handled by the global reminder poller in events/ready.js.
    },
};
