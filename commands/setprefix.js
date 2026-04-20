import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
import { setPrefix } from "../utils/prefixCache.js";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";
export const data = new SlashCommandBuilder()
    .setName("setprefix")
    .setDescription("Change the bot prefix for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt
    .setName("prefix")
    .setDescription("The new prefix (1-5 characters, e.g. !, ?, $, %)")
    .setMinLength(1)
    .setMaxLength(5)
    .setRequired(true));
export async function execute(interaction) {
    if (!(await isPremiumGuild(interaction.guild.id))) {
        return interaction.reply({ embeds: [premiumDeniedEmbed("Custom Prefix")], flags: 64 });
    }
    const newPrefix = interaction.options.getString("prefix", true);
    const guild = interaction.guild;
    await setPrefix(guild.id, newPrefix);
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Prefix Updated")
        .setDescription(`The bot prefix for **${guild.name}** has been changed.`)
        .addFields({ name: "New Prefix", value: `\`${newPrefix}\``, inline: true }, { name: "Example", value: `\`${newPrefix}ban\`, \`${newPrefix}help\``, inline: true }, { name: "Changed By", value: interaction.user.tag, inline: true })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
