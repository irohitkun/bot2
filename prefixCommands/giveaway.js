import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db, giveawaysTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { isPremiumGuild, premiumDeniedEmbed, getPremiumTip } from "../utils/permissions.js";

// Match the slash command: cap at 14 days so Node setTimeout (max ~24.8d) never overflows.
const MAX_GIVEAWAY_MS = 14 * 24 * 60 * 60 * 1000;

function parseGiveawayDuration(input) {
    const match = input?.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = value * multipliers[match[2].toLowerCase()];
    if (ms <= 0 || ms > MAX_GIVEAWAY_MS) return null;
    return ms;
}

async function pickWinners(messageId, channelId, winnersCount, client) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return [];
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) return [];
    const reaction = msg.reactions.cache.get("🎉");
    if (!reaction) return [];
    const users = await reaction.users.fetch();
    const eligible = [...users.values()].filter((u) => !u.bot);
    return eligible
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(winnersCount, eligible.length))
        .map((u) => u.id);
}

export const command = {
    name: "giveaway",
    usage: "%giveaway <start|end|reroll> ...",
    description: "Start, end, or reroll a giveaway",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return void message.reply("❌ You need **Manage Server** permission.");
        }

        const sub = args[0]?.toLowerCase();
        const guildId = message.guild.id;

        // ── start ──────────────────────────────────────────────────────────────
        if (sub === "start") {
            const durationStr = args[1];
            const winnersCount = parseInt(args[2] ?? "1", 10) || 1;
            const prize = args.slice(3).join(" ").trim();

            if (!durationStr || !prize) {
                return void message.reply("Usage: `%giveaway start <duration> <winners> <prize>` — e.g. `%giveaway start 1h 1 Discord Nitro`");
            }

            const durationMs = parseGiveawayDuration(durationStr);
            if (!durationMs) {
                return void message.reply("❌ Invalid duration. Use formats like `10m`, `1h`, `7d` (max 14 days).");
            }

            const endsAt = new Date(Date.now() + durationMs);
            const channel = message.channel;

            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle("🎉 GIVEAWAY 🎉")
                .setDescription(
                    `**Prize:** ${prize}\n\nReact with 🎉 to enter!\n\n` +
                    `**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n` +
                    `**Winners:** ${winnersCount}`
                )
                .setFooter({ text: `Hosted by ${message.author.tag}` })
                .setTimestamp(endsAt);

            const giveawayMsg = await channel.send({ embeds: [embed] });
            await giveawayMsg.react("🎉");

            await db.insert(giveawaysTable).values({
                guildId,
                channelId: channel.id,
                messageId: giveawayMsg.id,
                prize,
                winnersCount,
                hostId: message.author.id,
                hostTag: message.author.tag,
                endsAt,
            });

            const premium = await isPremiumGuild(guildId);
            const tipLine = premium ? "" : `\n-# ${getPremiumTip("giveaway")}`;
            await message.reply(`✅ Giveaway started!${tipLine}`);

            setTimeout(async () => {
                const [row] = await db
                    .select()
                    .from(giveawaysTable)
                    .where(and(eq(giveawaysTable.messageId, giveawayMsg.id), eq(giveawaysTable.ended, false)));
                if (!row) return;
                const winners = await pickWinners(giveawayMsg.id, channel.id, winnersCount, message.client);
                await db
                    .update(giveawaysTable)
                    .set({ ended: true, winners: winners.join(",") })
                    .where(eq(giveawaysTable.messageId, giveawayMsg.id));

                const endEmbed = new EmbedBuilder()
                    .setColor(winners.length > 0 ? 0x57f287 : 0xed4245)
                    .setTitle("🎉 Giveaway Ended!")
                    .setDescription(
                        winners.length > 0
                            ? `**Prize:** ${prize}\n**Winner${winners.length > 1 ? "s" : ""}:** ${winners.map((id) => `<@${id}>`).join(", ")}`
                            : `**Prize:** ${prize}\n\nNo valid entries!`
                    )
                    .setTimestamp();
                await giveawayMsg.edit({ embeds: [endEmbed] }).catch(() => {});
                if (winners.length > 0) {
                    await channel
                        .send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${prize}**!`)
                        .catch(() => {});
                }
            }, durationMs);

            return;
        }

        // ── end ────────────────────────────────────────────────────────────────
        if (sub === "end") {
            const messageId = args[1]?.trim();
            if (!messageId) {
                return void message.reply("Usage: `%giveaway end <message_id>`");
            }

            const [row] = await db
                .select()
                .from(giveawaysTable)
                .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, false)));
            if (!row) {
                return void message.reply("❌ No active giveaway found with that message ID.");
            }

            const winners = await pickWinners(messageId, row.channelId, row.winnersCount, message.client);
            await db
                .update(giveawaysTable)
                .set({ ended: true, winners: winners.join(",") })
                .where(eq(giveawaysTable.messageId, messageId));

            const channel = await message.client.channels.fetch(row.channelId).catch(() => null);
            if (channel) {
                const giveawayMsg = await channel.messages.fetch(messageId).catch(() => null);
                if (giveawayMsg) {
                    const endEmbed = new EmbedBuilder()
                        .setColor(winners.length > 0 ? 0x57f287 : 0xed4245)
                        .setTitle("🎉 Giveaway Ended!")
                        .setDescription(
                            winners.length > 0
                                ? `**Prize:** ${row.prize}\n**Winners:** ${winners.map((id) => `<@${id}>`).join(", ")}`
                                : `**Prize:** ${row.prize}\n\nNo valid entries!`
                        )
                        .setTimestamp();
                    await giveawayMsg.edit({ embeds: [endEmbed] }).catch(() => {});
                    if (winners.length > 0) {
                        await channel
                            .send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${row.prize}**!`)
                            .catch(() => {});
                    }
                }
            }

            return void message.reply(
                winners.length > 0
                    ? `✅ Giveaway ended! Winners: ${winners.map((id) => `<@${id}>`).join(", ")}`
                    : "✅ Giveaway ended! No valid entries."
            );
        }

        // ── reroll (premium) ──────────────────────────────────────────────────
        if (sub === "reroll") {
            if (!(await isPremiumGuild(guildId))) {
                return void message.reply({ embeds: [premiumDeniedEmbed("Giveaway Reroll")] });
            }
            const messageId = args[1]?.trim();
            if (!messageId) {
                return void message.reply("Usage: `%giveaway reroll <message_id>`");
            }
            const [row] = await db
                .select()
                .from(giveawaysTable)
                .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, true)));
            if (!row) {
                return void message.reply("❌ No ended giveaway found with that message ID.");
            }
            const winners = await pickWinners(messageId, row.channelId, row.winnersCount, message.client);
            if (winners.length === 0) {
                return void message.reply("❌ No valid entries to reroll.");
            }
            const channel = await message.client.channels.fetch(row.channelId).catch(() => null);
            if (channel) {
                await channel
                    .send(`🎉 **Reroll!** New winner${winners.length > 1 ? "s" : ""}: ${winners.map((id) => `<@${id}>`).join(", ")}! Congrats on winning **${row.prize}**!`)
                    .catch(() => {});
            }
            return void message.reply(`✅ Rerolled! New winners: ${winners.map((id) => `<@${id}>`).join(", ")}`);
        }

        return void message.reply(
            "Usage:\n" +
            "`%giveaway start <duration> <winners> <prize>`\n" +
            "`%giveaway end <message_id>`\n" +
            "`%giveaway reroll <message_id>` *(Premium)*"
        );
    },
};
