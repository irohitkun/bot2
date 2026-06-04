import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { parseMention, autoDeleteReply } from "./index.js";

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

export const command = {
    name: "purge",
    aliases: ["clear", "prune", "clean"],
    usage: "%purge <1-100> [@user]",
    description: "Bulk delete messages (4 modes: amount, user, until, from)",
    async execute(message, args) {
        const p = message._prefix ?? "%";
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages))
            return void autoDeleteReply(message, "❌ You need the **Manage Messages** permission.");

        const sub = args[0]?.toLowerCase();

        if (sub === "user") {
            const rawUser = args[1];
            if (!rawUser) return void autoDeleteReply(message, `Usage: \`${p}purge user <@user> [amount]\``);
            const userId = parseMention(rawUser) ?? rawUser;
            const amount = parseInt(args[2] ?? "100", 10);
            if (isNaN(amount) || amount < 1 || amount > 100)
                return void autoDeleteReply(message, "❌ Amount must be between 1 and 100.");
            await message.delete().catch(() => {});
            const channel = message.channel;
            const fetched = await channel.messages.fetch({ limit: amount });
            const toDelete = [...fetched.values()].filter(
                (m) => m.author.id === userId && m.createdTimestamp > Date.now() - TWO_WEEKS
            );
            if (toDelete.length === 0) {
                const warn = await channel.send("❌ No recent eligible messages from that user.");
                setTimeout(() => warn.delete().catch(() => {}), 5000);
                return;
            }
            const deleted = await channel.bulkDelete(toDelete, true);
            return void sendResult(channel, deleted.size, "User filter applied");
        }

        if (sub === "until") {
            const messageId = args[1];
            if (!messageId || !/^\d{15,21}$/.test(messageId))
                return void autoDeleteReply(message, `❌ Provide a valid message ID. Usage: \`${p}purge until <message_id>\``);
            await message.delete().catch(() => {});
            const channel = message.channel;
            let totalDeleted = 0;
            let lastId;
            let reached = false;
            while (totalDeleted < 500) {
                const opts = { limit: 100 };
                if (lastId) opts.before = lastId;
                const batch = await channel.messages.fetch(opts).catch(() => null);
                if (!batch || batch.size === 0) break;
                const toDelete = [];
                for (const msg of batch.values()) {
                    if (msg.id === messageId) { reached = true; break; }
                    if (msg.createdTimestamp > Date.now() - TWO_WEEKS) toDelete.push(msg);
                }
                if (toDelete.length > 0) {
                    const del = await channel.bulkDelete(toDelete, true).catch(() => null);
                    totalDeleted += del?.size ?? 0;
                }
                if (reached || batch.size < 100) break;
                lastId = batch.last()?.id;
            }
            if (totalDeleted === 0) {
                const warn = await channel.send("❌ No eligible messages found (14-day limit or ID not found).");
                setTimeout(() => warn.delete().catch(() => {}), 5000);
                return;
            }
            return void sendResult(channel, totalDeleted, `Until \`${messageId}\``);
        }

        if (sub === "from") {
            const messageId = args[1];
            if (!messageId || !/^\d{15,21}$/.test(messageId))
                return void autoDeleteReply(message, `❌ Provide a valid message ID. Usage: \`${p}purge from <message_id>\``);
            await message.delete().catch(() => {});
            const channel = message.channel;
            const batch = await channel.messages.fetch({ limit: 100, after: messageId }).catch(() => null);
            if (!batch || batch.size === 0) {
                const warn = await channel.send("❌ No messages found after that message ID.");
                setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            }
            const toDelete = [...batch.values()].filter((m) => m.createdTimestamp > Date.now() - TWO_WEEKS);
            if (toDelete.length === 0) {
                const warn = await channel.send("❌ No eligible messages within the 14-day window.");
                setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            }
            const deleted = await channel.bulkDelete(toDelete, true);
            return void sendResult(channel, deleted.size, `From \`${messageId}\``);
        }

        if (sub === "bots") {
            const scan = Math.min(100, Math.max(1, parseInt(args[1] ?? "100", 10) || 100));
            await message.delete().catch(() => {});
            const channel = message.channel;
            const fetched = await channel.messages.fetch({ limit: scan });
            const toDelete = [...fetched.values()].filter(
                (m) => m.author.bot && m.createdTimestamp > Date.now() - TWO_WEEKS
            );
            if (toDelete.length === 0) {
                const warn = await channel.send(`❌ No bot messages found in the last ${scan} messages.`);
                setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            }
            const deleted = await channel.bulkDelete(toDelete, true);
            return void sendResult(channel, deleted.size, "Bots only");
        }

        const amount = parseInt(sub ?? "", 10);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return void autoDeleteReply(message, [
                `❌ Invalid usage. Modes:`,
                `\`${p}purge <1-100> [@user]\` — delete last N messages`,
                `\`${p}purge user <@user> [amount]\` — delete a user's recent messages`,
                `\`${p}purge bots [amount]\` — delete bot messages only`,
                `\`${p}purge until <msg_id>\` — delete back to a message ID`,
                `\`${p}purge from <msg_id>\` — delete messages after a message ID`,
            ].join("\n"));
        }
        const filterUserId = args[1] ? (parseMention(args[1]) ?? args[1]) : null;
        await message.delete().catch(() => {});
        const channel = message.channel;
        const fetched = await channel.messages.fetch({ limit: amount });
        let toDelete = [...fetched.values()].filter((m) => m.createdTimestamp > Date.now() - TWO_WEEKS);
        if (filterUserId) toDelete = toDelete.filter((m) => m.author.id === filterUserId);
        if (toDelete.length === 0) {
            const warn = await channel.send("❌ No eligible messages found to delete.");
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
        }
        const deleted = await channel.bulkDelete(toDelete, true);
        return void sendResult(channel, deleted.size, filterUserId ? "User filter applied" : null);
    },
};

async function sendResult(channel, count, detail) {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🗑️ Messages Purged")
        .addFields({ name: "Deleted", value: `${count} message(s)`, inline: true })
        .setTimestamp();
    if (detail) embed.addFields({ name: "Filter", value: detail, inline: true });
    const reply = await channel.send({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 5000);
}
