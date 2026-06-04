import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { db, voteRecordsTable, memberStatsTable, premiumGuildsTable, voteReminderOptInTable } from "../db/index.js";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { invalidatePremiumCache } from "./permissions.js";
import { scheduleVoteReminder } from "./voteReminder.js";

const VOTE_COIN_REWARD = 200;
const VOTE_XP_REWARD = 100;
const VOTE_STREAK_BONUS = 50;
const VOTE_PREMIUM_HOURS = 16;
const VOTE_PREMIUM_MS = VOTE_PREMIUM_HOURS * 60 * 60 * 1000;
const STREAK_RESET_WINDOW_MS = 36 * 60 * 60 * 1000;

// Top.gg can send type "upvote", "vote", or "vote.create" depending on version/config
const UPVOTE_TYPES = new Set(["upvote", "vote", "vote.create"]);

export function registerTopggWebhook(app, client) {
    app.post("/topgg/webhook", (req, res) => {
        // Respond IMMEDIATELY so Top.gg never times out
        res.status(200).end();

        const body = req.body ?? {};
        const type = body.type;
        // Top.gg sends the voter's ID in "user" — handle alternate field names defensively
        const userId = body.user ?? body.userId ?? body.bot_user ?? body.voter;

        const secret = process.env.TOPGG_WEBHOOK_SECRET?.trim();
        const incomingAuth = (req.headers?.authorization ?? req.headers?.["x-topgg-authorization"] ?? "").trim();

        // Explicit test ping from the Top.gg dashboard ("Send Test" with type:"test")
        if (type === "test") {
            console.log("[TopGG] ✅ Test ping received — webhook is connected and reachable!");
            return;
        }

        if (secret) {
            if (incomingAuth && incomingAuth !== secret) {
                console.warn(`[TopGG] Auth rejected — header mismatch: "${incomingAuth.slice(0, 30)}"`);
                return;
            }
            if (!incomingAuth) {
                console.warn("[TopGG] Note: TOPGG_WEBHOOK_SECRET is set but no auth header in request — accepting anyway. To enforce auth, set the same value as your Top.gg dashboard → Webhooks → Authorization.");
            }
        } else {
            console.warn("[TopGG] Warning: TOPGG_WEBHOOK_SECRET not set — accepting all requests. Set it to match your Top.gg dashboard password.");
        }

        console.log(`[TopGG] Webhook received — type: ${type}, userId: ${userId}`);

        if (!UPVOTE_TYPES.has(type) || !userId) {
            console.log(`[TopGG] Ignored — type: ${type}, userId: ${userId}`);
            return;
        }

        // Fire-and-forget — response already sent above
        processVote(client, userId).catch(err => {
            console.error("[TopGG] Error processing vote:", err);
        });
    });

    console.log("[TopGG Webhook] Listening on POST /topgg/webhook");
}

async function processVote(client, userId) {
    const botId = client.user.id;
    const voteUrl = `https://top.gg/bot/${botId}/vote`;
    console.log(`[TopGG] Processing vote for user ${userId}...`);

    // 1. Streak + totals
    const [existing] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));
    const streakExpired = existing?.lastVotedAt
        ? Date.now() - existing.lastVotedAt.getTime() > STREAK_RESET_WINDOW_MS
        : false;
    const streak = existing && !streakExpired ? (existing.voteStreak ?? 0) + 1 : 1;
    const total = existing ? (existing.totalVotes ?? 0) + 1 : 1;

    await db.insert(voteRecordsTable)
        .values({ userId, lastVotedAt: new Date(), voteStreak: streak, totalVotes: total })
        .onConflictDoUpdate({
            target: voteRecordsTable.userId,
            set: { lastVotedAt: new Date(), voteStreak: streak, totalVotes: total },
        });

    // 2. Coins + XP
    const coinsEarned = VOTE_COIN_REWARD + streak * VOTE_STREAK_BONUS;
    try {
        await db.update(memberStatsTable).set({
            coins: drizzleSql`${memberStatsTable.coins} + ${coinsEarned}`,
            xp: drizzleSql`${memberStatsTable.xp} + ${VOTE_XP_REWARD}`,
            updatedAt: new Date(),
        }).where(eq(memberStatsTable.userId, userId));
    } catch (e) { console.warn("[TopGG] Coins/XP credit failed:", e.message); }

    // 3. Mutual guilds
    const mutualGuilds = [];
    for (const guild of client.guilds.cache.values()) {
        const member = guild.members.cache.get(userId)
            ?? await guild.members.fetch(userId).catch(() => null);
        if (member) mutualGuilds.push(guild);
    }
    const expiresAt = new Date(Date.now() + VOTE_PREMIUM_MS);

    // 4. DM the voter
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
        try {
            if (mutualGuilds.length === 0) {
                await user.send({ embeds: [new EmbedBuilder()
                    .setColor(0xf1c40f).setTitle("✅ Thanks for Voting!")
                    .setURL(voteUrl)
                    .setDescription(`**Rewards:**\n🪙 ${coinsEarned} coins  •  ⭐ ${VOTE_XP_REWARD} XP  •  🏆 ${VOTE_PREMIUM_HOURS}h Premium\n\nYou're not in any server with this bot. Join one, then run \`/vote check\`.\n\n🔥 Streak: **${streak}**  |  Total: **${total}**`)
                    .setTimestamp()] }).catch(() => {});
            } else if (mutualGuilds.length === 1) {
                await activatePremium(mutualGuilds[0].id, userId, user.tag, expiresAt);
                await user.send({ embeds: [new EmbedBuilder()
                    .setColor(0xf1c40f).setTitle("✅ Thanks for Voting!")
                    .setURL(voteUrl)
                    .setDescription(`**Rewards:**\n🪙 ${coinsEarned} coins  •  ⭐ ${VOTE_XP_REWARD} XP\n🏆 **${VOTE_PREMIUM_HOURS}h Premium** → applied to **${mutualGuilds[0].name}**!\n\nRun \`/premium status\` to confirm.\n🔥 Streak: **${streak}**  |  Total: **${total}**`)
                    .addFields({ name: "Premium Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true })
                    .setTimestamp()] }).catch(() => {});
            } else {
                const options = mutualGuilds.slice(0, 25).map(g =>
                    new StringSelectMenuOptionBuilder().setLabel(g.name.slice(0, 100)).setValue(g.id).setDescription(`Give ${VOTE_PREMIUM_HOURS}h Premium to this server`)
                );
                const menu = new StringSelectMenuBuilder()
                    .setCustomId(`vote:server:${userId}:${expiresAt.getTime()}`)
                    .setPlaceholder("Pick which server gets 16h Premium…")
                    .addOptions(options);
                await user.send({
                    embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle("✅ Thanks for Voting! Pick Your Server")
                        .setURL(voteUrl)
                        .setDescription(`**Rewards:**\n🪙 ${coinsEarned} coins  •  ⭐ ${VOTE_XP_REWARD} XP\n🏆 **${VOTE_PREMIUM_HOURS}h Premium** — you're in **${mutualGuilds.length}** servers. Pick one!\n\nAfter picking, run \`/premium status\` to confirm.\n🔥 Streak: **${streak}**  |  Total: **${total}**`)
                        .setFooter({ text: "Selection expires in 5 minutes" }).setTimestamp()],
                    components: [new ActionRowBuilder().addComponents(menu)],
                }).catch(() => {});
            }
        } catch (e) { console.warn("[TopGG] Failed to DM voter:", e.message); }

        // Schedule 12h reminder to vote again
        try {
            const [optIn] = await db.select().from(voteReminderOptInTable).where(eq(voteReminderOptInTable.userId, userId));
            if (optIn?.optedIn !== false) scheduleVoteReminder(client, userId, streak);
        } catch {}
    } else {
        console.warn(`[TopGG] Could not fetch user ${userId} — DM skipped`);
    }

    // 5. Vote log channel + owner DMs
    const logEmbed = new EmbedBuilder().setColor(0x5865f2).setTitle("🗳️ New Vote!")
        .addFields(
            { name: "User", value: user ? `${user.tag} (<@${userId}>)` : `Unknown (${userId})`, inline: true },
            { name: "Streak", value: streakExpired ? `🔥 1 (reset)` : `🔥 ${streak}`, inline: true },
            { name: "Total Votes", value: `${total}`, inline: true },
            { name: "Coins Earned", value: `🪙 ${coinsEarned}`, inline: true },
            { name: "Server Premium", value: mutualGuilds.length > 0
                ? `Offered to ${mutualGuilds.length} guild(s): ${mutualGuilds.map(g => g.name).join(", ").slice(0, 200)}`
                : "No shared servers", inline: false },
        ).setTimestamp();

    const logChannelId = process.env.VOTE_LOG_CHANNEL_ID;
    if (logChannelId) {
        try {
            const ch = await client.channels.fetch(logChannelId).catch(() => null);
            if (ch?.isTextBased()) {
                await ch.send({ embeds: [logEmbed] });
                console.log(`[TopGG] Vote log sent to #${ch.name}`);
            } else {
                console.warn(`[TopGG] VOTE_LOG_CHANNEL_ID=${logChannelId} not found or not a text channel`);
            }
        } catch (e) { console.error("[TopGG] Vote log channel error:", e.message); }
    } else {
        console.log("[TopGG] No VOTE_LOG_CHANNEL_ID set — skipping log channel post");
    }

    const ownerIds = [...new Set([
        ...(process.env.BOT_OWNERS ?? "").split(",").map(s => s.trim()).filter(Boolean),
        "1298631508533313536",
    ])];
    for (const ownerId of ownerIds) {
        if (ownerId === userId) continue;
        try { const owner = await client.users.fetch(ownerId); await owner.send({ embeds: [logEmbed] }); }
        catch {}
    }

    console.log(`[TopGG] ✅ Vote fully processed for ${userId} (streak: ${streak}, total: ${total}${streakExpired ? " — streak reset" : ""})`);
}

async function activatePremium(guildId, userId, userTag, expiresAt) {
    await db.insert(premiumGuildsTable).values({
        guildId, activatedBy: userId, activatedByTag: userTag, expiresAt,
        tier: "premium", isTrial: false, reminderSent: false, notifyUserId: userId,
        activationMethod: "vote", notes: `Vote — ${VOTE_PREMIUM_HOURS}h premium`,
    }).onConflictDoUpdate({
        target: premiumGuildsTable.guildId,
        set: {
            activatedBy: userId, activatedByTag: userTag, activatedAt: new Date(), expiresAt,
            tier: "premium", isTrial: false, reminderSent: false, notifyUserId: userId,
            activationMethod: "vote", notes: `Vote — ${VOTE_PREMIUM_HOURS}h premium`,
        },
    });
    invalidatePremiumCache(guildId);
    console.log(`[TopGG] Premium activated for guild ${guildId} until ${expiresAt.toISOString()}`);
}
