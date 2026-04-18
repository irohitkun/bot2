import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) => opt.setName("user").setDescription("The user to ban").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the ban").setRequired(false))
    .addIntegerOption((opt) => opt
    .setName("delete_days")
    .setDescription("Number of days of messages to delete (0-7)")
    .setMinValue(0)
    .setMaxValue(7)
    .setRequired(false));
export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const guild = interaction.guild;
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
        return interaction.reply({ content: "Could not find that member in the server.", flags: 64 });
    }
    if (!member.bannable) {
        return interaction.reply({ content: "I cannot ban this user. They may have a higher role than me.", flags: 64 });
    }
    if (member.id === interaction.user.id) {
        return interaction.reply({ content: "You cannot ban yourself.", flags: 64 });
    }
    await member.ban({ deleteMessageSeconds: deleteDays * 86400, reason });
    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔨 Member Banned")
        .addFields({ name: "User", value: `${target.tag} (${target.id})`, inline: true }, { name: "Moderator", value: interaction.user.tag, inline: true }, { name: "Reason", value: reason }, { name: "Messages Deleted", value: `${deleteDays} day(s)`, inline: true })
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
