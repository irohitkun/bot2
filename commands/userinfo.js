import { SlashCommandBuilder, EmbedBuilder, } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get information about a user")
    .addUserOption((opt) => opt.setName("user").setDescription("The user to look up (defaults to you)").setRequired(false));
export async function execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const guild = interaction.guild;
    const member = await guild.members.fetch(target.id).catch(() => null);
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`👤 ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields({ name: "User ID", value: target.id, inline: true }, { name: "Account Created", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true })
        .setTimestamp();
    if (member) {
        embed.addFields({ name: "Joined Server", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Unknown", inline: true }, { name: "Nickname", value: member.nickname ?? "None", inline: true }, {
            name: `Roles (${member.roles.cache.size - 1})`,
            value: member.roles.cache
                .filter((r) => r.id !== guild.id)
                .sort((a, b) => b.position - a.position)
                .map((r) => r.toString())
                .slice(0, 10)
                .join(", ") || "None",
        }, { name: "Timed Out", value: member.isCommunicationDisabled() ? "Yes" : "No", inline: true });
    }
    await interaction.reply({ embeds: [embed] });
}
