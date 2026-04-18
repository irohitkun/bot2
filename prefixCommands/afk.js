import { EmbedBuilder } from "discord.js";
import { db, afkUsersTable } from "../db/index.js";
export const command = {
    name: "afk",
    usage: "%afk [reason]",
    description: "Set your AFK status",
    async execute(message, args) {
        const reason = args.join(" ") || "AFK";
        await db.insert(afkUsersTable).values({ userId: message.author.id, guildId: message.guild.id, reason })
            .onConflictDoUpdate({ target: [afkUsersTable.userId, afkUsersTable.guildId], set: { reason, setAt: new Date() } });
        const embed = new EmbedBuilder().setColor(0xfee75c).setTitle("💤 AFK Status Set")
            .setDescription(`You are now AFK: **${reason}**`).setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
