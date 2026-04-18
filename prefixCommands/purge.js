import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention } from "./index.js";
export const command = {
    name: "purge",
    usage: "%purge <1-100> [@user]",
    description: "Bulk delete messages",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return void message.reply("❌ You don't have permission to manage messages.");
        }
        if (!args[0])
            return void message.reply(`Usage: \`${this.usage}\``);
        const amount = parseInt(args[0], 10);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return void message.reply("❌ Please provide a number between 1 and 100.");
        }
        const filterUserId = args[1] ? (parseMention(args[1]) ?? args[1]) : null;
        const channel = message.channel;
        await message.delete().catch(() => { });
        const fetched = await channel.messages.fetch({ limit: amount });
        let toDelete = [...fetched.values()];
        if (filterUserId) {
            toDelete = toDelete.filter((m) => m.author.id === filterUserId);
        }
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        toDelete = toDelete.filter((m) => m.createdTimestamp > twoWeeksAgo);
        if (toDelete.length === 0) {
            return void channel.send("❌ No eligible messages found to delete.").then((m) => setTimeout(() => m.delete().catch(() => { }), 4000));
        }
        const deleted = await channel.bulkDelete(toDelete, true);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🗑️ Messages Purged")
            .addFields({ name: "Deleted", value: `${deleted.size} message(s)`, inline: true }, { name: "Moderator", value: message.author.tag, inline: true })
            .setTimestamp();
        const reply = await channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => { }), 5000);
    },
};
