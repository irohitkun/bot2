import { EmbedBuilder } from "discord.js";
import { db, birthdaysTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_IN_MONTH = [31,29,31,30,31,30,31,31,30,31,30,31];

export const command = {
    name: "birthday",
    usage: "%birthday set <month> <day> | %birthday remove | %birthday today | %birthday view [@user]",
    description: "Birthday system — set and view birthdays",
    async execute(message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === "set") {
            const month = parseInt(args[1], 10);
            const day = parseInt(args[2], 10);
            if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
                return void message.reply("Usage: `%birthday set <month 1-12> <day>`");
            }
            if (day > DAYS_IN_MONTH[month - 1]) return void message.reply(`❌ ${MONTHS[month - 1]} doesn't have ${day} days.`);
            await db.insert(birthdaysTable).values({ userId: message.author.id, guildId: message.guild.id, month, day })
                .onConflictDoUpdate({ target: [birthdaysTable.userId, birthdaysTable.guildId], set: { month, day } });
            return void message.reply(`✅ Birthday set to **${MONTHS[month - 1]} ${day}**. 🎂`);
        }

        if (sub === "remove") {
            const result = await db.delete(birthdaysTable).where(and(eq(birthdaysTable.userId, message.author.id), eq(birthdaysTable.guildId, message.guild.id))).returning();
            if (result.length === 0) return void message.reply("❌ No birthday registered.");
            return void message.reply("✅ Birthday removed.");
        }

        if (sub === "today") {
            const now = new Date();
            const month = now.getUTCMonth() + 1;
            const day = now.getUTCDate();
            const birthdays = await db.select().from(birthdaysTable).where(and(eq(birthdaysTable.guildId, message.guild.id), eq(birthdaysTable.month, month), eq(birthdaysTable.day, day)));
            if (birthdays.length === 0) return void message.reply(`No birthdays today (${MONTHS[month - 1]} ${day}). 🎂`);
            return void message.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle(`🎂 Birthdays Today — ${MONTHS[month - 1]} ${day}`).setDescription(birthdays.map((b) => `<@${b.userId}>`).join(", "))] });
        }

        if (sub === "view") {
            const userId = message.mentions.users.first()?.id ?? message.author.id;
            const [bd] = await db.select().from(birthdaysTable).where(and(eq(birthdaysTable.userId, userId), eq(birthdaysTable.guildId, message.guild.id)));
            if (!bd) return void message.reply(`❌ No birthday registered for <@${userId}> in this server.`);
            const thisYear = new Date().getUTCFullYear();
            let next = new Date(Date.UTC(thisYear, bd.month - 1, bd.day));
            if (next.getTime() < Date.now()) next = new Date(Date.UTC(thisYear + 1, bd.month - 1, bd.day));
            return void message.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle(`🎂 Birthday`).addFields({ name: "User", value: `<@${userId}>`, inline: true }, { name: "Date", value: `**${MONTHS[bd.month - 1]} ${bd.day}**`, inline: true }, { name: "Next", value: `<t:${Math.floor(next.getTime() / 1000)}:R>`, inline: true })] });
        }

        return void message.reply(`Usage:\n\`\`\`\n${this.usage}\n\`\`\``);
    },
};
