import { EmbedBuilder } from "discord.js";
import { parseMention } from "./index.js";
export const command = {
    name: "userinfo",
    usage: "%userinfo [@user]",
    description: "Get information about a user",
    async execute(message, args) {
        const userId = args[0] ? (parseMention(args[0]) ?? args[0]) : message.author.id;
        const guild = message.guild;
        const user = await message.client.users.fetch(userId).catch(() => null);
        if (!user)
            return void message.reply("❌ Could not find that user.");
        const member = await guild.members.fetch(userId).catch(() => null);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`👤 ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .addFields({ name: "User ID", value: user.id, inline: true }, { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true })
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
        await message.reply({ embeds: [embed] });
    },
};
