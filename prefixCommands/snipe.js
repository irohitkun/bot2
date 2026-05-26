import { EmbedBuilder } from "discord.js";
import { getSnipe } from "../utils/snipeCache.js";
export const command = {
    name: "snipe",
    aliases: ["s"],
    usage: "%snipe  |  %s",
    description: "Show the last deleted message in this channel",
    async execute(message) {
        const snipe = getSnipe(message.channelId);
        if (!snipe)
            return void message.reply("📭 No deleted messages cached in this channel.");
        const embed = new EmbedBuilder().setColor(0xed4245).setTitle("🔍 Sniped Message")
            .setDescription(snipe.content || "*[no text content]*")
            .setAuthor({ name: snipe.authorTag, iconURL: snipe.authorAvatar ?? undefined })
            .setFooter({ text: "Deleted" })
            .setTimestamp(snipe.deletedAt);
        if (snipe.imageUrl)
            embed.setImage(snipe.imageUrl);
        await message.reply({ embeds: [embed] });
    },
};
