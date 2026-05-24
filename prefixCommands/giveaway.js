import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db, giveawaysTable } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { isPremiumGuild, premiumDeniedEmbed, getPremiumTip } from "../utils/permissions.js";
import {
    scheduleGiveawayEnd,
    pickGiveawayWinners,
} from "../utils/giveawayScheduler.js";
import { parseDuration } from "../utils/duration.js";

// Long delays are chunked via safeSetTimeout in the scheduler, so we are not
// bound by Node's ~24.8d setTimeout limit.
const MAX_GIVEAWAY_MS = 30 * 24 * 60 * 60 * 1000;

function parseGiveawayDuration(input) {
    const ms = parseDuration(input);
    if (ms === null || ms <= 0 || ms > MAX_GIVEAWAY_MS) return null;
    return ms;
}

function buildEmbed(row) {
    const endTs = Math.floor(row.endsAt.getTime() / 1000);
    const lines = [
        "React with 🎉 to enter the giveaway.",
        "",
        `**Ends:** <t:${endTs}:F> (<t:${endTs}:R>)`,
        `**Winners:** ${row.winnersCount}`,
        `**Hosted by:** ${row.hostTag}`,
    ];

    const reqLines = [];
    if (row.requiredRoleId) reqLines.push(`☑ Must have <@&${row.requiredRoleId}>`);
    if (row.minAccountAgeDays && row.minAccountAgeDays > 0)
        reqLines.push(`☑ Account must be **${row.minAccountAgeDays}d+** old`);
    const bonusRoles = (row.bonusRoleIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (bonusRoles.length > 0 && row.bonusEntries > 0)
        reqLines.push(`★ ${bonusRoles.map((id) => `<@&${id}>`).join(", ")} → **+${row.bonusEntries}** extra entr${row.bonusEntries === 1 ? "y" : "ies"}`);
    if (reqLines.length > 0) lines.push("", "**Requirements**", ...reqLines);

    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(row.prize)
        .setDescription(lines.join("\n"))
        .setTimestamp(row.endsAt);
}

export const command = {
    name: "giveaway",
    aliases: ["gw", "g"],
    usage: "%giveaway <start|end|cancel|list|extend|reroll> ...",
    description: "Manage giveaways",
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
                return void message.reply("Usage: `%giveaway start <duration> <winners> <prize>` — e.g. `%giveaway start 1d12h 1 Discord Nitro`");
            }

            const durationMs = parseGiveawayDuration(durationStr);
            if (!durationMs) {
                return void message.reply("❌ Invalid duration. Use formats like `10m`, `1h`, `1d12h` (max 30 days).");
            }

            const endsAt = new Date(Date.now() + durationMs);
            const channel = message.channel;

            const insertValues = {
                guildId,
                channelId: channel.id,
                messageId: "pending",
                prize,
                winnersCount,
                hostId: message.author.id,
                hostTag: message.author.tag,
                endsAt,
            };

            const giveawayMsg = await channel.send({ embeds: [buildEmbed({ ...insertValues, bonusRoleIds: "", bonusEntries: 0 })] });
            await giveawayMsg.react("🎉");

            insertValues.messageId = giveawayMsg.id;
            const [inserted] = await db.insert(giveawaysTable).values(insertValues).returning();

            const premium = await isPremiumGuild(guildId);
            const tipLine = premium ? "" : `\n-# ${getPremiumTip("giveaway")}`;
            await message.reply(`✅ Giveaway started!${tipLine}\n-# Tip: use \`/giveaway start\` to set required roles, account age, or bonus entries.`);

            scheduleGiveawayEnd(message.client, inserted);
            return;
        }

        // ── end ────────────────────────────────────────────────────────────────
        if (sub === "end") {
            const messageId = args[1]?.trim();
            if (!messageId) return void message.reply("Usage: `%giveaway end <message_id>`");

            const [row] = await db.select().from(giveawaysTable)
                .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, false)));
            if (!row) return void message.reply("❌ No active giveaway found with that message ID.");

            const channel = await message.client.channels.fetch(row.channelId).catch(() => null);
            const giveawayMsg = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
            const winners = giveawayMsg ? await pickGiveawayWinners(giveawayMsg, row) : [];

            await db.update(giveawaysTable)
                .set({ ended: true, winners: winners.join(",") })
                .where(eq(giveawaysTable.messageId, messageId));

            if (giveawayMsg) {
                const endEmbed = new EmbedBuilder()
                    .setColor(winners.length > 0 ? 0x57f287 : 0xed4245)
                    .setTitle("🎉 Giveaway Ended!")
                    .setDescription(winners.length > 0
                        ? `**Prize:** ${row.prize}\n**Winners:** ${winners.map((id) => `<@${id}>`).join(", ")}`
                        : `**Prize:** ${row.prize}\n\nNo valid entries!`)
                    .setTimestamp();
                await giveawayMsg.edit({ embeds: [endEmbed] }).catch(() => {});
                if (winners.length > 0 && channel)
                    await channel.send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${row.prize}**!`).catch(() => {});
            }

            return void message.reply(winners.length > 0
                ? `✅ Giveaway ended! Winners: ${winners.map((id) => `<@${id}>`).join(", ")}`
                : "✅ Giveaway ended! No valid entries.");
        }

        // ── cancel ─────────────────────────────────────────────────────────────
        if (sub === "cancel") {
            const messageId = args[1]?.trim();
            if (!messageId) return void message.reply("Usage: `%giveaway cancel <message_id>`");

            const [row] = await db.select().from(giveawaysTable)
                .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, false)));
            if (!row) return void message.reply("❌ No active giveaway found with that message ID.");

            await db.update(giveawaysTable)
                .set({ ended: true, cancelled: true, winners: "" })
                .where(eq(giveawaysTable.id, row.id));

            const channel = await message.client.channels.fetch(row.channelId).catch(() => null);
            if (channel) {
                const giveawayMsg = await channel.messages.fetch(messageId).catch(() => null);
                if (giveawayMsg) {
                    const cancelEmbed = new EmbedBuilder()
                        .setColor(0x95a5a6)
                        .setTitle("🚫 Giveaway Cancelled")
                        .setDescription(`**Prize:** ${row.prize}\n\nThis giveaway was cancelled by a moderator.`)
                        .setTimestamp();
                    await giveawayMsg.edit({ embeds: [cancelEmbed] }).catch(() => {});
                }
            }
            return void message.reply("🚫 Giveaway cancelled. No winners were picked.");
        }

        // ── list ───────────────────────────────────────────────────────────────
        if (sub === "list") {
            const active = await db.select().from(giveawaysTable)
                .where(and(eq(giveawaysTable.guildId, guildId), eq(giveawaysTable.ended, false)))
                .orderBy(desc(giveawaysTable.endsAt));
            if (active.length === 0) return void message.reply("📭 No active giveaways in this server.");

            const lines = active.slice(0, 25).map((row) => {
                const link = `https://discord.com/channels/${row.guildId}/${row.channelId}/${row.messageId}`;
                const reqs = [];
                if (row.requiredRoleId) reqs.push(`role <@&${row.requiredRoleId}>`);
                if (row.minAccountAgeDays) reqs.push(`age ${row.minAccountAgeDays}d`);
                const reqLine = reqs.length > 0 ? ` • ${reqs.join(", ")}` : "";
                return `• **${row.prize}** — ${row.winnersCount} winner${row.winnersCount > 1 ? "s" : ""} — ends <t:${Math.floor(row.endsAt.getTime() / 1000)}:R>${reqLine}\n  [Jump](${link}) • \`${row.messageId}\``;
            });

            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle(`🎉 Active Giveaways (${active.length})`)
                .setDescription(lines.join("\n\n").slice(0, 4000))
                .setTimestamp();
            return void message.reply({ embeds: [embed] });
        }

        // ── extend ─────────────────────────────────────────────────────────────
        if (sub === "extend") {
            const messageId = args[1]?.trim();
            const extraStr = args[2];
            if (!messageId || !extraStr)
                return void message.reply("Usage: `%giveaway extend <message_id> <duration>` — e.g. `%giveaway extend 1234567890 2h`");

            const extraMs = parseGiveawayDuration(extraStr);
            if (!extraMs) return void message.reply("❌ Invalid duration. Use formats like `30m`, `2h`, `1d12h` (max 30 days).");

            const [row] = await db.select().from(giveawaysTable)
                .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, false)));
            if (!row) return void message.reply("❌ No active giveaway found with that message ID.");

            const newEndsAt = new Date(row.endsAt.getTime() + extraMs);
            if (newEndsAt.getTime() - Date.now() > MAX_GIVEAWAY_MS)
                return void message.reply("❌ That extension would push the giveaway past the 30 day maximum remaining duration.");

            await db.update(giveawaysTable).set({ endsAt: newEndsAt }).where(eq(giveawaysTable.id, row.id));

            const channel = await message.client.channels.fetch(row.channelId).catch(() => null);
            if (channel) {
                const giveawayMsg = await channel.messages.fetch(messageId).catch(() => null);
                if (giveawayMsg) {
                    const updated = { ...row, endsAt: newEndsAt };
                    await giveawayMsg.edit({ embeds: [buildEmbed(updated)] }).catch(() => {});
                }
            }

            scheduleGiveawayEnd(message.client, { ...row, endsAt: newEndsAt });
            return void message.reply(`✅ Giveaway extended! New end time: <t:${Math.floor(newEndsAt.getTime() / 1000)}:R>`);
        }

        // ── reroll (premium) ──────────────────────────────────────────────────
        if (sub === "reroll") {
            if (!(await isPremiumGuild(guildId)))
                return void message.reply({ embeds: [premiumDeniedEmbed("Giveaway Reroll")] });

            const messageId = args[1]?.trim();
            if (!messageId) return void message.reply("Usage: `%giveaway reroll <message_id>`");

            const [row] = await db.select().from(giveawaysTable)
                .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, true)));
            if (!row) return void message.reply("❌ No ended giveaway found with that message ID.");

            const channel = await message.client.channels.fetch(row.channelId).catch(() => null);
            const giveawayMsg = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
            const winners = giveawayMsg ? await pickGiveawayWinners(giveawayMsg, row) : [];
            if (winners.length === 0) return void message.reply("❌ No valid entries to reroll.");

            if (channel)
                await channel.send(`🎉 **Reroll!** New winner${winners.length > 1 ? "s" : ""}: ${winners.map((id) => `<@${id}>`).join(", ")}! Congrats on winning **${row.prize}**!`).catch(() => {});
            return void message.reply(`✅ Rerolled! New winners: ${winners.map((id) => `<@${id}>`).join(", ")}`);
        }

        return void message.reply(
            "Usage:\n" +
            "`%giveaway start <duration> <winners> <prize>`\n" +
            "`%giveaway end <message_id>`\n" +
            "`%giveaway cancel <message_id>`\n" +
            "`%giveaway list`\n" +
            "`%giveaway extend <message_id> <duration>`\n" +
            "`%giveaway reroll <message_id>` *(Premium)*\n" +
            "-# Tip: use the slash command `/giveaway start` for required roles, account age, and bonus entries.",
        );
    },
};
