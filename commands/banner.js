import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Display a user's profile banner")
    .addUserOption((opt) => opt.setName("user").setDescription("The user (defaults to you)").setRequired(false));
export async function execute(interaction) {
    const userId = interaction.options.getUser("user")?.id ?? interaction.user.id;
    const user = await interaction.client.users.fetch(userId, { force: true }).catch(() => null);
    if (!user)
        return interaction.reply({ content: "❌ Could not find that user.", flags: 64 });
    if (!user.banner)
        return interaction.reply({ content: `❌ **${user.tag}** does not have a profile banner.`, flags: 64 });
    const ext = user.banner.startsWith("a_") ? "gif" : "png";
    const bannerUrl = user.bannerURL({ size: 4096, extension: ext });
    const embed = new EmbedBuilder().setColor(0x5865f2)
        .setTitle(`🖼️ Banner — ${user.tag}`)
        .setImage(bannerUrl)
        .setDescription(`[Open Banner](${bannerUrl})`)
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
