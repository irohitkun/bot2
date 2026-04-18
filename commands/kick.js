import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((opt) => opt.setName("user").setDescription("The user to kick").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the kick").setRequired(false));
export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guild = interaction.guild;
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
        return interaction.reply({ content: "Could not find that member in the server.", flags: 64 });
    }
    if (!member.kickable) {
        return interaction.reply({ content: "I cannot kick this user. They may have a higher role than me.", flags: 64 });
    }
    if (member.id === interaction.user.id) {
        return interaction.reply({ content: "You cannot kick yourself.", flags: 64 });
    }
    await member.kick(reason);
    const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("👟 Member Kicked")
        .addFields({ name: "User", value: `${target.tag} (${target.id})`, inline: true }, { name: "Moderator", value: interaction.user.tag, inline: true }, { name: "Reason", value: reason })
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
