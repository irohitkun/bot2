import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
import { db, memberNotesTable } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";

export const command = {
    name: "note",
    usage: "%note add <@user> <text> | %note list <@user> | %note delete <id>",
    description: "Staff-only notes on members",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return void message.reply("❌ You need **Manage Messages** permission.");
        }

        const sub = args[0]?.toLowerCase();

        if (sub === "add") {
            const rawUser = args[1];
            if (!rawUser) return void message.reply("Usage: `%note add <@user> <text>`");
            const userId = parseMention(rawUser) ?? rawUser;
            const text = args.slice(2).join(" ");
            if (!text) return void message.reply("❌ Please provide note content.");
            if (text.length > 1000) return void message.reply("❌ Note must be under 1000 characters.");

            const user = await message.client.users.fetch(userId).catch(() => null);
            if (!user) return void message.reply("❌ Could not find that user.");

            const [note] = await db.insert(memberNotesTable).values({
                guildId: message.guild.id,
                userId: user.id,
                authorId: message.author.id,
                authorTag: message.author.tag,
                note: text,
            }).returning();

            return void message.reply(`✅ Note **#${note.id}** added for **${user.tag}**.`);
        }

        if (sub === "list") {
            const rawUser = args[1];
            if (!rawUser) return void message.reply("Usage: `%note list <@user>`");
            const userId = parseMention(rawUser) ?? rawUser;
            const user = await message.client.users.fetch(userId).catch(() => null);
            if (!user) return void message.reply("❌ Could not find that user.");

            const notes = await db.select().from(memberNotesTable)
                .where(and(eq(memberNotesTable.guildId, message.guild.id), eq(memberNotesTable.userId, user.id)))
                .orderBy(desc(memberNotesTable.createdAt));

            if (notes.length === 0) return void message.reply(`📝 No notes on **${user.tag}**.`);

            const lines = notes.slice(0, 10).map((n) =>
                `**#${n.id}** <t:${Math.floor(n.createdAt.getTime() / 1000)}:d> by ${n.authorTag}: ${n.note}`
            );
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`📝 Notes — ${user.tag}`)
                .setDescription(lines.join("\n").slice(0, 4000))
                .setFooter({ text: `${notes.length} note(s)` })
                .setTimestamp();
            return void message.reply({ embeds: [embed] });
        }

        if (sub === "delete") {
            const id = parseInt(args[1], 10);
            if (isNaN(id)) return void message.reply("Usage: `%note delete <id>`");

            const [note] = await db.select().from(memberNotesTable)
                .where(and(eq(memberNotesTable.id, id), eq(memberNotesTable.guildId, message.guild.id)));
            if (!note) return void message.reply(`❌ Note #${id} not found in this server.`);

            await db.delete(memberNotesTable).where(eq(memberNotesTable.id, id));
            return void message.reply(`✅ Note **#${id}** deleted.`);
        }

        return void message.reply(`Usage:\n\`\`\`\n${this.usage}\n\`\`\``);
    },
};
