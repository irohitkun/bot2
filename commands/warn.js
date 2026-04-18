import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
import { db, warningsTable } from "../db/index.js";
import { eq, and, count } from "drizzle-orm";
export const data = new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName("user").setDescription("The user to warn").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the warning").setRequired(true));
export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    const guild = interaction.guild;
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
        return interaction.reply({ content: "Could not find that member in the server.", flags: 64 });
    }
    if (member.id === interaction.user.id) {
        return interaction.reply({ content: "You cannot warn yourself.", flags: 64 });
    }
    await db.insert(warningsTable).values({
        guildId: guild.id,
        userId: target.id,
        userTag: target.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
    });
    const [{ value: totalWarnings }] = await db
        .select({ value: count() })
        .from(warningsTable)
        .where(and(eq(warningsTable.guildId, guild.id), eq(warningsTable.userId, target.id)));
    try {
        await target.send(`⚠️ You have been warned in **${guild.name}** by ${interaction.user.tag}.\n**Reason:** ${reason}\nYou now have **${totalWarnings}** warning(s).`);
    }
    catch { }
    const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("⚠️ Member Warned")
        .addFields({ name: "User", value: `${target.tag} (${target.id})`, inline: true }, { name: "Moderator", value: interaction.user.tag, inline: true }, { name: "Reason", value: reason }, { name: "Total Warnings", value: `${totalWarnings}`, inline: true })
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
