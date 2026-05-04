import { db, tagsTable } from "../db/index.js";
import { and, eq, desc, sql } from "drizzle-orm";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";

export const command = {
    name: "tag",
    usage: "%tag <name> | %tag add <name> <content> | %tag delete <name> | %tag list",
    description: "Use or manage server tags",
    async execute(message, args) {
        const sub = args[0]?.toLowerCase();

        if (!sub) return void message.reply(`Usage: \`${this.usage}\``);

        if (sub === "list") {
            const tags = await db.select().from(tagsTable)
                .where(eq(tagsTable.guildId, message.guild.id))
                .orderBy(desc(tagsTable.uses));
            if (tags.length === 0) return void message.reply("No tags yet. Use `%tag add <name> <content>` to create one.");
            const lines = tags.map((t) => `\`${t.name}\` (${t.uses} uses)`);
            return void message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🏷️ Tags (${tags.length})`).setDescription(lines.join("\n").slice(0, 4000))] });
        }

        if (sub === "add") {
            if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return void message.reply("❌ You need **Manage Messages** permission.");
            const name = args[1]?.toLowerCase().trim();
            if (!name) return void message.reply("Usage: `%tag add <name> <content>`");
            const content = args.slice(2).join(" ");
            if (!content) return void message.reply("❌ Please provide tag content.");
            if (content.length > 2000) return void message.reply("❌ Tag content must be under 2000 characters.");
            const existing = await db.select().from(tagsTable).where(and(eq(tagsTable.guildId, message.guild.id), eq(tagsTable.name, name)));
            if (existing.length > 0) return void message.reply(`❌ Tag \`${name}\` already exists.`);
            await db.insert(tagsTable).values({ guildId: message.guild.id, name, content, createdBy: message.author.id, createdByTag: message.author.tag });
            return void message.reply(`✅ Tag \`${name}\` created.`);
        }

        if (sub === "edit") {
            if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return void message.reply("❌ You need **Manage Messages** permission.");
            const name = args[1]?.toLowerCase().trim();
            if (!name) return void message.reply("Usage: `%tag edit <name> <content>`");
            const content = args.slice(2).join(" ");
            if (!content) return void message.reply("❌ Please provide new content.");
            const result = await db.update(tagsTable).set({ content, updatedAt: new Date() }).where(and(eq(tagsTable.guildId, message.guild.id), eq(tagsTable.name, name))).returning();
            if (result.length === 0) return void message.reply(`❌ Tag \`${name}\` not found.`);
            return void message.reply(`✅ Tag \`${name}\` updated.`);
        }

        if (sub === "delete") {
            if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return void message.reply("❌ You need **Manage Messages** permission.");
            const name = args[1]?.toLowerCase().trim();
            if (!name) return void message.reply("Usage: `%tag delete <name>`");
            const result = await db.delete(tagsTable).where(and(eq(tagsTable.guildId, message.guild.id), eq(tagsTable.name, name))).returning();
            if (result.length === 0) return void message.reply(`❌ Tag \`${name}\` not found.`);
            return void message.reply(`✅ Tag \`${name}\` deleted.`);
        }

        // Default: treat first arg as tag name to use
        const name = sub;
        const [tag] = await db.select().from(tagsTable).where(and(eq(tagsTable.guildId, message.guild.id), eq(tagsTable.name, name)));
        if (!tag) return void message.reply(`❌ No tag named \`${name}\`. Use \`%tag list\` to see all tags.`);
        await db.update(tagsTable).set({ uses: sql`${tagsTable.uses} + 1` }).where(eq(tagsTable.id, tag.id));
        return void message.channel.send(tag.content);
    },
};
