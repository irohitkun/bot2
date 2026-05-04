import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
import { db, scheduledMessagesTable } from "../db/index.js";
import { and, eq } from "drizzle-orm";
import { parseDuration } from "../utils/parseDuration.js";

export const command = {
    name: "schedule",
    usage: "%schedule add [#channel] <when> <content> | %schedule list | %schedule cancel <id>",
    description: "Schedule a message to be sent at a specific time",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return void message.reply("❌ You need **Manage Messages** permission.");
        }
        const sub = args[0]?.toLowerCase();

        if (sub === "list") {
            const msgs = await db.select().from(scheduledMessagesTable)
                .where(and(eq(scheduledMessagesTable.guildId, message.guild.id), eq(scheduledMessagesTable.sent, false)));
            if (msgs.length === 0) return void message.reply("No scheduled messages pending.");
            const lines = msgs.map((m) => `**#${m.id}** <t:${Math.floor(m.sendAt.getTime() / 1000)}:R> → <#${m.channelId}>: ${m.content.slice(0, 60)}…`);
            return void message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("⏰ Scheduled Messages").setDescription(lines.join("\n").slice(0, 4000))] });
        }

        if (sub === "cancel") {
            const id = parseInt(args[1], 10);
            if (isNaN(id)) return void message.reply("Usage: `%schedule cancel <id>`");
            const [row] = await db.select().from(scheduledMessagesTable).where(and(eq(scheduledMessagesTable.id, id), eq(scheduledMessagesTable.guildId, message.guild.id)));
            if (!row) return void message.reply(`❌ Scheduled message #${id} not found.`);
            if (row.sent) return void message.reply(`❌ Message #${id} was already sent.`);
            await db.delete(scheduledMessagesTable).where(eq(scheduledMessagesTable.id, id));
            return void message.reply(`✅ Scheduled message **#${id}** cancelled.`);
        }

        if (sub === "add") {
            // %schedule add [#channel] <when> <content>
            let argIdx = 1;
            let channelId = message.channel.id;
            if (args[argIdx] && (args[argIdx].startsWith("<#") || /^\d{17,20}$/.test(args[argIdx]))) {
                channelId = parseMention(args[argIdx]) ?? args[argIdx];
                argIdx++;
            }
            const when = args[argIdx];
            if (!when) return void message.reply("Usage: `%schedule add [#channel] <when> <content>`");
            const content = args.slice(argIdx + 1).join(" ");
            if (!content) return void message.reply("❌ Please provide message content.");

            const ms = parseDuration(when);
            let sendAt;
            if (ms && ms >= 60_000) {
                sendAt = new Date(Date.now() + ms);
            } else {
                const parsed = new Date(when.includes(" ") ? when.replace(" ", "T") + "Z" : when);
                if (isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
                    return void message.reply("❌ Invalid or past time. Use relative (`2h`, `30m`) or UTC datetime (`2025-12-01 18:00`).");
                }
                sendAt = parsed;
            }

            const [row] = await db.insert(scheduledMessagesTable).values({
                guildId: message.guild.id, channelId, content, sendAt,
                createdBy: message.author.id, createdByTag: message.author.tag,
            }).returning();

            return void message.reply(`✅ Message **#${row.id}** scheduled for <t:${Math.floor(sendAt.getTime() / 1000)}:F> in <#${channelId}>.`);
        }

        return void message.reply(`Usage:\n\`\`\`\n${this.usage}\n\`\`\``);
    },
};
