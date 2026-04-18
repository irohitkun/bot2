import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove timeout from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName("user").setDescription("The user to unmute").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for unmuting").setRequired(false));
export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guild = interaction.guild;
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
        return interaction.reply({ content: "Could not find that member in the server.", flags: 64 });
    }
    if (!member.isCommunicationDisabled()) {
        return interaction.reply({ content: "This user is not currently muted.", flags: 64 });
    }
    await member.timeout(null, reason);
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔊 Member Unmuted")
        .addFields({ name: "User", value: `${target.tag} (${target.id})`, inline: true }, { name: "Moderator", value: interaction.user.tag, inline: true }, { name: "Reason", value: reason })
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
