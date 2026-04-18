import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
function parseDuration(input) {
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match)
        return null;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit] * 1000;
}
export const data = new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout (mute) a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName("user").setDescription("The user to mute").setRequired(true))
    .addStringOption((opt) => opt
    .setName("duration")
    .setDescription("Duration (e.g. 10m, 1h, 2d). Max 28 days.")
    .setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the mute").setRequired(false));
export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const durationInput = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const durationMs = parseDuration(durationInput);
    if (!durationMs) {
        return interaction.reply({ content: "Invalid duration format. Use formats like `10m`, `1h`, `2d`.", flags: 64 });
    }
    const maxMs = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > maxMs) {
        return interaction.reply({ content: "Duration cannot exceed 28 days.", flags: 64 });
    }
    const guild = interaction.guild;
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
        return interaction.reply({ content: "Could not find that member in the server.", flags: 64 });
    }
    if (!member.moderatable) {
        return interaction.reply({ content: "I cannot mute this user. They may have a higher role than me.", flags: 64 });
    }
    if (member.id === interaction.user.id) {
        return interaction.reply({ content: "You cannot mute yourself.", flags: 64 });
    }
    await member.timeout(durationMs, reason);
    const until = new Date(Date.now() + durationMs);
    const embed = new EmbedBuilder()
        .setColor(0xf47b67)
        .setTitle("🔇 Member Muted")
        .addFields({ name: "User", value: `${target.tag} (${target.id})`, inline: true }, { name: "Moderator", value: interaction.user.tag, inline: true }, { name: "Duration", value: durationInput, inline: true }, { name: "Expires", value: `<t:${Math.floor(until.getTime() / 1000)}:R>`, inline: true }, { name: "Reason", value: reason })
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
