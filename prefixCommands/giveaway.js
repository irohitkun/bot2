import { parseDuration } from "./index.js";
import { db, giveawaysTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
async function pickWinners(messageId, channelId, winnersCount, client) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel)
        return [];
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg)
        return [];
    const reaction = msg.reactions.cache.get("🎉");
    if (!reaction)
        return [];
    const users = await reaction.users.fetch();
    const eligible = [...users.values()].filter((u) => !u.bot);
    return eligible.sort(() => Math.random() - 0.5).slice(0, Math.min(winnersCount, eligible.length)).map((u) => u.id);
}
export const command = {
    name: "giveaway",
    usage: "%giveaway start <duration> <winners> <prize>",
    description: "Start a giveaway",
    async execute(message, args) {
        if (!message.member?.permissions.has("ManageGuild"))
            return void message.reply("❌ You need **Manage Server** permission.");
        const sub = args[0]?.toLowerCase();
        if (sub === "start") {
            const durationStr = args[1];
            const winners = parseInt(args[2] ?? "1");
            const prize = args.slice(3).join(" ");
            if (!durationStr || !prize)
                return void message.reply("Usage: `%giveaway start <duration> <winners> <prize>`");
            const durationMs = parseDuration(durationStr);
            if (!durationMs)
                return void message.reply("❌ Invalid duration. Use formats like `10m`, `1h`, `7d`.");
            const endsAt = new Date(Date.now() + durationMs);
            const msg = await message.channel.send(`🎉 **GIVEAWAY** 🎉\n**Prize:** ${prize}\nReact with 🎉 to enter!\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R> | **Winners:** ${winners}`);
            await msg.react("🎉");
            await db.insert(giveawaysTable).values({
                guildId: message.guild.id, channelId: message.channelId, messageId: msg.id,
                prize, winnersCount: winners, hostId: message.author.id, hostTag: message.author.tag, endsAt,
            });
            await message.reply(`✅ Giveaway started!`);
            setTimeout(async () => {
                const [row] = await db.select().from(giveawaysTable).where(and(eq(giveawaysTable.messageId, msg.id), eq(giveawaysTable.ended, false)));
                if (!row)
                    return;
                const w = await pickWinners(msg.id, message.channelId, winners, message.client);
                await db.update(giveawaysTable).set({ ended: true, winners: w.join(",") }).where(eq(giveawaysTable.messageId, msg.id));
                await msg.edit(`🎉 **GIVEAWAY ENDED** 🎉\n**Prize:** ${prize}\n${w.length > 0 ? `**Winner${w.length > 1 ? "s" : ""}:** ${w.map((id) => `<@${id}>`).join(", ")}` : "No valid entries!"}`);
                if (w.length > 0)
                    await message.channel.send(`🎉 Congratulations ${w.map((id) => `<@${id}>`).join(", ")}! You won **${prize}**!`);
            }, durationMs);
            return;
        }
        await message.reply(`Usage: \`%giveaway start <duration> <winners> <prize>\``);
    },
};
