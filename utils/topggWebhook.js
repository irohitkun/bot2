/**
 * Top.gg Vote Webhook Handler
 * ----------------------------
 * Registers an HTTP POST route at /topgg/webhook on the bot's internal express server.
 * Verifies the Authorization header against TOPGG_WEBHOOK_SECRET.
 * On a valid vote:
 *   1. Credits coins + XP to the voter
 *   2. If they're in multiple servers → DMs them a server picker
 *   3. If only one mutual server → auto-activates Premium there
 *   4. DMs the bot owner(s) + posts to VOTE_LOG_CHANNEL_ID
 *   5. Sends a vote reminder DM when the 12h window re-opens (if opted in)
 */

import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { db, voteRecordsTable, memberStatsTable, premiumGuildsTable, voteReminderOptInTable } from "../db/index.js";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { invalidatePremiumCache, isBotOwner } from "./permissions.js";

const VOTE_COIN_REWARD = 200;
const VOTE_XP_REWARD = 100;
const VOTE_STREAK_BONUS = 50;
const VOTE_PREMIUM_HOURS = 16;
const VOTE_PREMIUM_MS = VOTE_PREMIUM_HOURS * 60 * 60 * 1000;
const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * Register the /topgg/webhook route on an Express app.
 * @param {import('express').Express} app
 * @param {import('discord.js').Client} client
 */
export function registerTopggWebhook(app, client) {
    app.post("/topgg/webhook", async (req, res) => {
        const secret = process.env.TOPGG_WEBHOOK_SECRET;
        if (secret && req.headers.authorization !== secret) {
            return res.status(401).send("Unauthorized");
        }

        res.sendStatus(200);

        try {
            const { user: userId, type, isWeekend } = req.body ?? {};
            if (!userId || type !== "upvote") return;

            await processVote(client, userId, !!isWeekend);
        } catch (err) {
            console.error("[TopGG Webhook] Error processing vote:", err);
        }
    });

    console.log("[TopGG Webhook] Registered POST /topgg/webhook");
}

async function processVote(client, userId, isWeekend) {
    const botId = client.user.id;
    const voteUrl = `https://top.gg/bot/${botId}/vote`;

    // ── 1. Update vote record ─────────────────────────────────────────────────
    const [existing] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));
    const streak = existing ? (existing.voteStreak ?? 0) + 1 : 1;
    const total = existing ? (existing.totalVotes ?? 0) + 1 : 1;
    const lastVotedAt = new Date();

    await db.insert(voteRecordsTable).values({ userId, lastVotedAt, voteStreak: streak, totalVotes: total })
        .onConflictDoUpdate({
            target: voteRecordsTable.userId,
            set: { lastVotedAt, voteStreak: streak, totalVotes: total },
        });

    // ── 2. Credit coins + XP ──────────────────────────────────────────────────
    const coinsEarned = VOTE_COIN_REWARD + streak * VOTE_STREAK_BONUS;
    try {
        const [stats] = await db.select().from(memberStatsTable).where(eq(memberStatsTable.userId, userId));
        if (stats) {
            await db.update(memberStatsTable).set({
                coins: drizzleSql`${memberStatsTable.coins} + ${coinsEarned}`,
                xp: drizzleSql`${memberStatsTable.xp} + ${VOTE_XP_REWARD}`,
                updatedAt: new Date(),
            }).where(eq(memberStatsTable.userId, userId));
        }
    } catch {}

    // ── 3. Resolve mutual guilds ──────────────────────────────────────────────
    const mutualGuilds = [];
    for (const guild of client.guilds.cache.values()) {
        const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
        if (member) mutualGuilds.push(guild);
    }

    const expiresAt = new Date(Date.now() + VOTE_PREMIUM_MS);

    // ── 4. Notify voter via DM ────────────────────────────────────────────────
    try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
            if (mutualGuilds.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xf1c40f)
                    .setTitle("✅ Thanks for Voting!")
                    .setURL(voteUrl)
                    .setDescription(
                        `**Rewards Earned:**\n🪙 ${coinsEarned} coins (${VOTE_COIN_REWARD} base + streak bonus)\n⭐ ${VOTE_XP_REWARD} XP\n🏆 ${VOTE_PREMIUM_HOURS}h Premium\n\n` +
                        `Join a server with Crux and run \`/vote check\` to apply Premium to it!\n\n` +
                        `🔥 Streak: **${streak}** | Total Votes: **${total}**`
                    )
                    .setTimestamp();
                await user.send({ embeds: [embed] }).catch(() => {});
            } else if (mutualGuilds.length === 1) {
                await activatePremium(mutualGuilds[0].id, userId, user.tag, expiresAt);
                const embed = new EmbedBuilder()
                    .setColor(0xf1c40f)
                    .setTitle("✅ Thanks for Voting!")
                    .setURL(voteUrl)
                    .setDescription(
                        `**Rewards Earned:**\n🪙 ${coinsEarned} coins\n⭐ ${VOTE_XP_REWARD} XP\n🏆 **${VOTE_PREMIUM_HOURS}h Premium** applied to **${mutualGuilds[0].name}**!\n\n` +
                        `🔥 Streak: **${streak}** | Total Votes: **${total}**\n\nVote again in 12 hours!`
                    )
                    .addFields({ name: "Premium Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true })
                    .setTimestamp();
                await user.send({ embeds: [embed] }).catch(() => {});
            } else {
                // Multiple guilds — send a server picker DM
                const options = mutualGuilds.slice(0, 25).map((g) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(g.name.slice(0, 100))
                        .setValue(g.id)
                        .setDescription(`Apply ${VOTE_PREMIUM_HOURS}h Premium to this server`)
                );
                const menu = new StringSelectMenuBuilder()
                    .setCustomId(`vote:server:${userId}:${expiresAt.getTime()}`)
                    .setPlaceholder("Select which server gets Premium…")
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(menu);

                const embed = new EmbedBuilder()
                    .setColor(0xf1c40f)
                    .setTitle("✅ Thanks for Voting!")
                    .setURL(voteUrl)
                    .setDescription(
                        `**Rewards Earned:**\n🪙 ${coinsEarned} coins\n⭐ ${VOTE_XP_REWARD} XP\n🏆 **${VOTE_PREMIUM_HOURS}h Premium** for one server\n\n` +
                        `You're in **${mutualGuilds.length}** servers with Crux. Pick which one gets Premium!\n\n` +
                        `🔥 Streak: **${streak}** | Total Votes: **${total}**`
                    )
                    .setFooter({ text: "Selection expires in 5 minutes" })
                    .setTimestamp();

                await user.send({ embeds: [embed], components: [row] }).catch(() => {});
            }

            // ── 5. Schedule vote reminder DM ─────────────────────────────────
            const [optIn] = await db.select().from(voteReminderOptInTable).where(eq(voteReminderOptInTable.userId, userId));
            if (optIn?.optedIn !== false) {
                setTimeout(async () => {
                    try {
                        const [freshRecord] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));
                        if (freshRecord && Date.now() - freshRecord.lastVotedAt.getTime() < VOTE_COOLDOWN_MS - 60_000) return;
                        const embed2 = new EmbedBuilder()
                            .setColor(0x5865f2)
                            .setTitle("🗳️ Time to Vote Again!")
                            .setDescription(
                                `Your 12-hour voting window is open! Vote for Crux on Top.gg to earn coins, XP, and another **${VOTE_PREMIUM_HOURS}h of Premium**.\n\n` +
                                `[👉 Vote on Top.gg](${voteUrl})\n\nRun \`/vote remind\` to turn off these DMs.`
                            )
                            .addFields({ name: "Current Streak", value: `🔥 ${streak} days`, inline: true })
                            .setTimestamp();
                        await user.send({ embeds: [embed2] }).catch(() => {});
                    } catch {}
                }, VOTE_COOLDOWN_MS + 2 * 60 * 1000);
            }
        }
    } catch {}

    // ── 6. Notify bot owners + vote log channel ───────────────────────────────
    try {
        const voterUser = await client.users.fetch(userId).catch(() => null);
        const ownerEmbed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🗳️ New Vote Received!")
            .addFields(
                { name: "Voter", value: voterUser ? `${voterUser.tag} (${userId})` : userId, inline: true },
                { name: "Weekend?", value: isWeekend ? "Yes" : "No", inline: true },
                { name: "Streak", value: `🔥 ${streak}`, inline: true },
                { name: "Total Votes", value: `${total}`, inline: true },
                { name: "Server Premium", value: mutualGuilds.length > 0 ? `Offered to ${mutualGuilds.length} shared guild(s)` : "No shared guilds", inline: false },
            )
            .setTimestamp();

        const logChannelId = process.env.VOTE_LOG_CHANNEL_ID;
        if (logChannelId) {
            const ch = client.channels.cache.get(logChannelId) ?? await client.channels.fetch(logChannelId).catch(() => null);
            if (ch?.isTextBased()) await ch.send({ embeds: [ownerEmbed] }).catch(() => {});
        }

        // DM all bot owners
        const ownerIds = [...new Set([
            ...(process.env.BOT_OWNERS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
            "1298631508533313536",
        ])];
        for (const ownerId of ownerIds) {
            if (ownerId === userId) continue; // Don't DM if the voter is the owner
            const owner = await client.users.fetch(ownerId).catch(() => null);
            if (owner) await owner.send({ embeds: [ownerEmbed] }).catch(() => {});
        }
    } catch {}
}

async function activatePremium(guildId, userId, userTag, expiresAt) {
    await db.insert(premiumGuildsTable).values({
        guildId,
        activatedBy: userId,
        activatedByTag: userTag,
        expiresAt,
        tier: "premium",
        isTrial: false,
        reminderSent: false,
        notifyUserId: userId,
        activationMethod: "vote",
        notes: `Vote webhook — ${VOTE_PREMIUM_HOURS}h premium granted automatically`,
    }).onConflictDoUpdate({
        target: premiumGuildsTable.guildId,
        set: {
            activatedBy: userId,
            activatedByTag: userTag,
            activatedAt: new Date(),
            expiresAt,
            tier: "premium",
            isTrial: false,
            reminderSent: false,
            notifyUserId: userId,
            activationMethod: "vote",
            notes: `Vote webhook — ${VOTE_PREMIUM_HOURS}h premium granted automatically`,
        },
    });
    invalidatePremiumCache(guildId);
}
