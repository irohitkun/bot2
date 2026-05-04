import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
import { db, warningsTable, tempBansTable, memberNotesTable } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";

export const command = {
    name: "history",
    usage: "%history <@user|user_id>",
    description: "View moderation history for a member",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return void message.reply("❌ You need **Manage Messages** permission.");
        }
        if (!args[0]) return void message.reply(`Usage: \`${this.usage}\``);

        const userId = parseMention(args[0]) ?? args[0];
        const user = await message.client.users.fetch(userId).catch(() => null);
        if (!user) return void message.reply("❌ Could not find that user.");

        const guildId = message.guild.id;
        const [warnings, tempBans, notes] = await Promise.all([
            db.select().from(warningsTable).where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, user.id))).orderBy(desc(warningsTable.createdAt)),
            db.select().from(tempBansTable).where(and(eq(tempBansTable.guildId, guildId), eq(tempBansTable.userId, user.id))).orderBy(desc(tempBansTable.bannedAt)),
            db.select().from(memberNotesTable).where(and(eq(memberNotesTable.guildId, guildId), eq(memberNotesTable.userId, user.id))).orderBy(desc(memberNotesTable.createdAt)),
        ]);

        const total = warnings.length + tempBans.length;
        const embed = new EmbedBuilder()
            .setColor(total >= 5 ? 0xed4245 : total > 0 ? 0xfee75c : 0x57f287)
            .setTitle(`📋 Mod History — ${user.tag}`)
            .setThumbnail(user.displayAvatarURL())
            .addFields({ name: "Summary", value: `⚠️ ${warnings.length} warning(s) · ⏰ ${tempBans.length} temp ban(s) · 📝 ${notes.length} note(s)` });

        if (warnings.length > 0) {
            const lines = warnings.slice(0, 6).map((w) => `**#${w.id}** <t:${Math.floor(w.createdAt.getTime() / 1000)}:d> by ${w.moderatorTag}: ${w.reason}`);
            embed.addFields({ name: `⚠️ Warnings (${warnings.length})`, value: lines.join("\n").slice(0, 1024) });
        }
        if (tempBans.length > 0) {
            const lines = tempBans.slice(0, 4).map((b) => `**#${b.id}** <t:${Math.floor(b.bannedAt.getTime() / 1000)}:d> by ${b.moderatorTag} [${b.unbanned ? "✅ expired" : "🔴 active"}]: ${b.reason}`);
            embed.addFields({ name: `⏰ Temp Bans (${tempBans.length})`, value: lines.join("\n").slice(0, 1024) });
        }
        if (notes.length > 0) {
            const lines = notes.slice(0, 4).map((n) => `**#${n.id}** <t:${Math.floor(n.createdAt.getTime() / 1000)}:d> by ${n.authorTag}: ${n.note}`);
            embed.addFields({ name: `📝 Notes (${notes.length})`, value: lines.join("\n").slice(0, 1024) });
        }
        if (total === 0 && notes.length === 0) embed.setDescription("✅ No mod actions on record.");

        embed.setFooter({ text: `User ID: ${user.id}` }).setTimestamp();
        return void message.reply({ embeds: [embed] });
    },
};
