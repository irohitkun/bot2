import { SlashCommandBuilder, EmbedBuilder, } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Display information about this server");
export async function execute(interaction) {
    const guild = interaction.guild;
    await guild.fetch();
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🏠 ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
        .addFields({ name: "Server ID", value: guild.id, inline: true }, { name: "Owner", value: `<@${guild.ownerId}>`, inline: true }, { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }, { name: "Members", value: `${guild.memberCount}`, inline: true }, { name: "Channels", value: `${guild.channels.cache.size}`, inline: true }, { name: "Roles", value: `${guild.roles.cache.size}`, inline: true }, { name: "Boost Level", value: `Level ${guild.premiumTier}`, inline: true }, { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true }, { name: "Verification Level", value: guild.verificationLevel.toString(), inline: true })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
