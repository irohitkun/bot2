import { EmbedBuilder } from "discord.js";
import { parseMention } from "./index.js";
export const command = {
    name: "banner",
    usage: "%banner [@user]",
    description: "Display a user's profile banner",
    async execute(message, args) {
        let userId = message.author.id;
        if (args[0])
            userId = parseMention(args[0]) ?? args[0];
        const user = await message.client.users.fetch(userId, { force: true }).catch(() => null);
        if (!user)
            return void message.reply("❌ Could not find that user.");
        if (!user.banner)
            return void message.reply(`❌ **${user.tag}** does not have a profile banner.`);
        const ext = user.banner.startsWith("a_") ? "gif" : "png";
        const bannerUrl = user.bannerURL({ size: 4096, extension: ext });
        const embed = new EmbedBuilder().setColor(0x5865f2)
            .setTitle(`🖼️ Banner — ${user.tag}`)
            .setImage(bannerUrl)
            .setDescription(`[Open Banner](${bannerUrl})`)
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
