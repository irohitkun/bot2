import { EmbedBuilder } from "discord.js";
import { parseMention } from "./index.js";
export const command = {
    name: "avatar",
    aliases: ["av", "pfp", "icon"],
    usage: "%avatar [@user]",
    description: "Display a user's avatar",
    async execute(message, args) {
        let target = message.author;
        if (args[0]) {
            const id = parseMention(args[0]) ?? args[0];
            target = await message.client.users.fetch(id).catch(() => message.author);
        }
        const member = await message.guild.members.fetch(target.id).catch(() => null);
        const globalAvatar = target.displayAvatarURL({ size: 4096, extension: "png" });
        const serverAvatar = member?.displayAvatarURL({ size: 4096, extension: "png" });
        const links = [`[Global Avatar](${globalAvatar})`, serverAvatar && serverAvatar !== globalAvatar ? `[Server Avatar](${serverAvatar})` : null].filter(Boolean).join(" • ");
        const embed = new EmbedBuilder().setColor(0x5865f2)
            .setTitle(`🖼️ Avatar — ${target.tag}`)
            .setImage(serverAvatar ?? globalAvatar)
            .setDescription(links)
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
