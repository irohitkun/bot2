import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Display a user's avatar")
    .addUserOption((opt) => opt.setName("user").setDescription("The user (defaults to you)").setRequired(false));
export async function execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const globalAvatar = target.displayAvatarURL({ size: 4096, extension: "png" });
    const serverAvatar = member?.displayAvatarURL({ size: 4096, extension: "png" });
    const links = [`[Global Avatar](${globalAvatar})`];
    if (serverAvatar && serverAvatar !== globalAvatar)
        links.push(`[Server Avatar](${serverAvatar})`);
    const embed = new EmbedBuilder().setColor(0x5865f2)
        .setTitle(`🖼️ Avatar — ${target.tag}`)
        .setImage(serverAvatar ?? globalAvatar)
        .setDescription(links.join(" • "))
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
