import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
import { db, warningsTable } from "../db/index.js";
import { eq, and, count } from "drizzle-orm";
export const command = {
    name: "clearwarn",
    aliases: ["cw", "warnreset"],
    usage: "%clearwarn @user",
    description: "Clear all warnings for a member",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return void message.reply("❌ You don't have permission to clear warnings.");
        }
        if (!args[0])
            return void message.reply(`Usage: \`${this.usage}\``);
        const userId = parseMention(args[0]) ?? args[0];
        const guild = message.guild;
        const user = await message.client.users.fetch(userId).catch(() => null);
        if (!user)
            return void message.reply("❌ Could not find that user.");
        const [{ value: prev }] = await db
            .select({ value: count() })
            .from(warningsTable)
            .where(and(eq(warningsTable.guildId, guild.id), eq(warningsTable.userId, userId)));
        await db
            .delete(warningsTable)
            .where(and(eq(warningsTable.guildId, guild.id), eq(warningsTable.userId, userId)));
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Warnings Cleared")
            .addFields({ name: "User", value: `${user.tag} (${userId})`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Warnings Removed", value: `${prev}`, inline: true })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
