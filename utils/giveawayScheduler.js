import { EmbedBuilder } from "discord.js";
import { db, giveawaysTable } from "../db/index.js";
import { eq } from "drizzle-orm";

const MAX_TIMEOUT_MS = 2_147_483_647;

export function safeSetTimeout(fn, delay) {
    if (delay > MAX_TIMEOUT_MS) {
        return setTimeout(() => safeSetTimeout(fn, delay - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
    }
    return setTimeout(fn, Math.max(0, delay));
}

async function pickWinners(message, winnersCount) {
    const reaction = message.reactions.cache.get("🎉");
    if (!reaction) return [];
    const users = await reaction.users.fetch();
    const eligible = [...users.values()].filter((u) => !u.bot);
    if (eligible.length === 0) return [];
    return eligible
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(winnersCount, eligible.length))
        .map((u) => u.id);
}

export async function endGiveaway(client, row) {
    try {
        const [current] = await db
            .select()
            .from(giveawaysTable)
            .where(eq(giveawaysTable.id, row.id));
        if (!current || current.ended) return;

        // If endsAt has been pushed into the future (e.g. by extend), reschedule.
        const remaining = current.endsAt.getTime() - Date.now();
        if (remaining > 0) {
            safeSetTimeout(() => endGiveaway(client, current), remaining);
            return;
        }

        const channel = await client.channels.fetch(current.channelId).catch(() => null);
        const message = channel
            ? await channel.messages.fetch(current.messageId).catch(() => null)
            : null;

        let winners = [];
        if (message) winners = await pickWinners(message, current.winnersCount);

        await db
            .update(giveawaysTable)
            .set({ ended: true, winners: winners.join(",") })
            .where(eq(giveawaysTable.id, current.id));

        if (message) {
            const endEmbed = new EmbedBuilder()
                .setColor(winners.length > 0 ? 0x57f287 : 0xed4245)
                .setTitle("🎉 Giveaway Ended!")
                .setDescription(
                    winners.length > 0
                        ? `**Prize:** ${current.prize}\n**Winner${winners.length > 1 ? "s" : ""}:** ${winners.map((id) => `<@${id}>`).join(", ")}`
                        : `**Prize:** ${current.prize}\n\nNo valid entries!`,
                )
                .setTimestamp();
            await message.edit({ embeds: [endEmbed] }).catch(() => {});
            if (winners.length > 0 && channel) {
                await channel
                    .send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${current.prize}**!`)
                    .catch(() => {});
            }
        }

        console.log(`[Giveaways] Ended giveaway ${current.id} (${current.prize})`);
    } catch (err) {
        console.error(`[Giveaways] Error ending giveaway ${row.id}:`, err);
    }
}

export function scheduleGiveawayEnd(client, row) {
    const delay = row.endsAt.getTime() - Date.now();
    if (delay <= 0) {
        endGiveaway(client, row);
    } else {
        safeSetTimeout(() => endGiveaway(client, row), delay);
    }
}
