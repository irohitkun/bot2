import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getSnipe } from "../utils/snipeCache.js";
export const data = new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Show the last deleted message in this channel");
export async function execute(interaction) {
    const snipe = getSnipe(interaction.channelId);
    if (!snipe)
        return interaction.reply({ content: "📭 No deleted messages cached in this channel.", flags: 64 });
    const embed = new EmbedBuilder().setColor(0xed4245)
        .setTitle("🔍 Sniped Message")
        .setDescription(snipe.content || "*[no text content]*")
        .setAuthor({ name: snipe.authorTag, iconURL: snipe.authorAvatar ?? undefined })
        .setFooter({ text: "Deleted" })
        .setTimestamp(snipe.deletedAt);
    if (snipe.imageUrl)
        embed.setImage(snipe.imageUrl);
    await interaction.reply({ embeds: [embed] });
}
