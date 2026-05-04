import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
import { db, stickyMessagesTable } from "../db/index.js";
import { and, eq } from "drizzle-orm";

export const command = {
    name: "sticky",
    usage: "%sticky set [#channel] <content> | %sticky remove [#channel] | %sticky list",
    description: "Manage sticky messages",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return void message.reply("❌ You need **Manage Channels** permission.");
        }
        const sub = args[0]?.toLowerCase();

        if (sub === "list") {
            const stickies = await db.select().from(stickyMessagesTable)
                .where(and(eq(stickyMessagesTable.guildId, message.guild.id), eq(stickyMessagesTable.enabled, true)));
            if (stickies.length === 0) return void message.reply("No sticky messages set.");
            const lines = stickies.map((s) => `<#${s.channelId}>: ${s.content.slice(0, 60)}…`);
            return void message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`📌 Sticky Messages (${stickies.length})`).setDescription(lines.join("\n").slice(0, 4000))] });
        }

        if (sub === "remove") {
            let channelId = message.channel.id;
            if (args[1]) channelId = parseMention(args[1]) ?? args[1];
            const [row] = await db.select().from(stickyMessagesTable).where(and(eq(stickyMessagesTable.guildId, message.guild.id), eq(stickyMessagesTable.channelId, channelId)));
            if (!row) return void message.reply("❌ No sticky message in that channel.");
            if (row.lastMessageId) await message.guild.channels.cache.get(channelId)?.messages.delete(row.lastMessageId).catch(() => {});
            await db.delete(stickyMessagesTable).where(and(eq(stickyMessagesTable.guildId, message.guild.id), eq(stickyMessagesTable.channelId, channelId)));
            return void message.reply(`✅ Sticky removed from <#${channelId}>.`);
        }

        if (sub === "set") {
            let channelId = message.channel.id;
            let contentStart = 1;
            if (args[1] && (args[1].startsWith("<#") || /^\d{17,20}$/.test(args[1]))) {
                channelId = parseMention(args[1]) ?? args[1];
                contentStart = 2;
            }
            const content = args.slice(contentStart).join(" ");
            if (!content) return void message.reply("Usage: `%sticky set [#channel] <content>`");
            if (content.length > 2000) return void message.reply("❌ Content must be under 2000 characters.");

            await db.insert(stickyMessagesTable).values({ guildId: message.guild.id, channelId, content, lastMessageId: null, createdBy: message.author.id })
                .onConflictDoUpdate({ target: [stickyMessagesTable.guildId, stickyMessagesTable.channelId], set: { content, lastMessageId: null, enabled: true, createdBy: message.author.id, createdAt: new Date() } });

            const channel = message.guild.channels.cache.get(channelId);
            if (channel) {
                const msg = await channel.send({ content: `📌 **Sticky:**\n${content}` }).catch(() => null);
                if (msg) await db.update(stickyMessagesTable).set({ lastMessageId: msg.id }).where(and(eq(stickyMessagesTable.guildId, message.guild.id), eq(stickyMessagesTable.channelId, channelId)));
            }
            return void message.reply(`✅ Sticky message set for <#${channelId}>.`);
        }

        return void message.reply(`Usage:\n\`\`\`\n${this.usage}\n\`\`\``);
    },
};
