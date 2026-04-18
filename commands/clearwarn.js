import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
import { db, warningsTable } from "../db/index.js";
import { eq, and, count } from "drizzle-orm";
export const data = new SlashCommandBuilder()
    .setName("clearwarn")
    .setDescription("Clear all warnings for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) => opt.setName("user").setDescription("The user to clear warnings for").setRequired(true));
export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const guild = interaction.guild;
    const [{ value: prev }] = await db
        .select({ value: count() })
        .from(warningsTable)
        .where(and(eq(warningsTable.guildId, guild.id), eq(warningsTable.userId, target.id)));
    await db
        .delete(warningsTable)
        .where(and(eq(warningsTable.guildId, guild.id), eq(warningsTable.userId, target.id)));
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Warnings Cleared")
        .addFields({ name: "User", value: `${target.tag} (${target.id})`, inline: true }, { name: "Moderator", value: interaction.user.tag, inline: true }, { name: "Warnings Removed", value: `${prev}`, inline: true })
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
