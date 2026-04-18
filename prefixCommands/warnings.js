import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
import { db, warningsTable } from "../db/index.js";
import { eq, and, asc } from "drizzle-orm";
export const command = {
    name: "warnings",
    usage: "%warnings @user",
    description: "View warnings for a member",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return void message.reply("❌ You don't have permission to view warnings.");
        }
        if (!args[0])
            return void message.reply(`Usage: \`${this.usage}\``);
        const userId = parseMention(args[0]) ?? args[0];
        const guild = message.guild;
        const user = await message.client.users.fetch(userId).catch(() => null);
        if (!user)
            return void message.reply("❌ Could not find that user.");
        const userWarnings = await db
            .select()
            .from(warningsTable)
            .where(and(eq(warningsTable.guildId, guild.id), eq(warningsTable.userId, userId)))
            .orderBy(asc(warningsTable.createdAt));
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`⚠️ Warnings for ${user.tag}`)
            .setTimestamp();
        if (userWarnings.length === 0) {
            embed.setDescription("This user has no warnings.");
        }
        else {
            embed.setDescription(`Total warnings: **${userWarnings.length}**`);
            for (let i = 0; i < userWarnings.length; i++) {
                const w = userWarnings[i];
                embed.addFields({
                    name: `#${i + 1} — ${w.createdAt.toLocaleDateString()}`,
                    value: `**Reason:** ${w.reason}\n**Moderator:** ${w.moderatorTag}`,
                });
            }
        }
        await message.reply({ embeds: [embed] });
    },
};
