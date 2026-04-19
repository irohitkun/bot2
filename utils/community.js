import { EmbedBuilder } from "discord.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, memberStatsTable } from "../db/index.js";

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;

export function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function xpNeededForLevel(level) {
    return 100 + Math.max(0, level - 1) * 75;
}

export function calculateLevel(totalXp) {
    let level = 1;
    let remaining = Math.max(0, totalXp);
    while (remaining >= xpNeededForLevel(level)) {
        remaining -= xpNeededForLevel(level);
        level += 1;
    }
    return {
        level,
        currentLevelXp: remaining,
        nextLevelXp: xpNeededForLevel(level),
    };
}

export async function animateInteraction(interaction, steps, finalPayload) {
    await interaction.deferReply();
    for (const step of steps) {
        await wait(850);
        await interaction.editReply({ content: step, embeds: [], components: [] });
    }
    await wait(650);
    await interaction.editReply(finalPayload);
}

export async function animateMessage(message, steps, finalPayload) {
    const reply = await message.reply(steps[0]);
    for (const step of steps.slice(1)) {
        await wait(850);
        await reply.edit(step);
    }
    await wait(650);
    await reply.edit(finalPayload);
}

export async function getOrCreateMemberStats(guildId, user) {
    const calculated = calculateLevel(0);
    await db.insert(memberStatsTable).values({
        guildId,
        userId: user.id,
        userTag: user.tag,
        level: calculated.level,
    }).onConflictDoUpdate({
        target: [memberStatsTable.guildId, memberStatsTable.userId],
        set: {
            userTag: user.tag,
            updatedAt: new Date(),
        },
    });

    const [stats] = await db.select().from(memberStatsTable)
        .where(and(eq(memberStatsTable.guildId, guildId), eq(memberStatsTable.userId, user.id)));
    return stats;
}

export async function getMemberRank(guildId, userId, xp) {
    const higherRanked = await db.select({ userId: memberStatsTable.userId })
        .from(memberStatsTable)
        .where(and(eq(memberStatsTable.guildId, guildId), sql`${memberStatsTable.xp} > ${xp}`));
    return higherRanked.length + 1;
}

export async function getLeaderboard(guildId, limit = 5) {
    return db.select().from(memberStatsTable)
        .where(eq(memberStatsTable.guildId, guildId))
        .orderBy(desc(memberStatsTable.xp))
        .limit(limit);
}

export async function claimDailyReward(guildId, user) {
    const stats = await getOrCreateMemberStats(guildId, user);
    const now = Date.now();
    const lastDaily = stats.lastDailyAt?.getTime() ?? 0;
    const nextDailyAt = lastDaily + DAILY_COOLDOWN_MS;

    if (lastDaily && now < nextDailyAt) {
        return {
            claimed: false,
            stats,
            nextDailyAt: new Date(nextDailyAt),
        };
    }

    const streak = lastDaily && now - lastDaily <= STREAK_WINDOW_MS ? stats.dailyStreak + 1 : 1;
    const coinReward = Math.min(250, 100 + streak * 15);
    const xpReward = Math.min(150, 40 + streak * 10);
    const nextXp = stats.xp + xpReward;
    const nextCoins = stats.coins + coinReward;
    const levelInfo = calculateLevel(nextXp);

    await db.update(memberStatsTable)
        .set({
            userTag: user.tag,
            xp: nextXp,
            coins: nextCoins,
            level: levelInfo.level,
            dailyStreak: streak,
            lastDailyAt: new Date(now),
            updatedAt: new Date(now),
        })
        .where(and(eq(memberStatsTable.guildId, guildId), eq(memberStatsTable.userId, user.id)));

    return {
        claimed: true,
        stats: {
            ...stats,
            userTag: user.tag,
            xp: nextXp,
            coins: nextCoins,
            level: levelInfo.level,
            dailyStreak: streak,
            lastDailyAt: new Date(now),
            updatedAt: new Date(now),
        },
        coinReward,
        xpReward,
        levelInfo,
    };
}

export function createProfileEmbed({ user, stats, rank, color }) {
    const levelInfo = calculateLevel(stats.xp);
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`${user.username}'s Profile`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            { name: "Rank", value: `#${rank}`, inline: true },
            { name: "Level", value: `${levelInfo.level}`, inline: true },
            { name: "Coins", value: `${stats.coins}`, inline: true },
            { name: "XP", value: `${levelInfo.currentLevelXp}/${levelInfo.nextLevelXp}`, inline: true },
            { name: "Total XP", value: `${stats.xp}`, inline: true },
            { name: "Daily Streak", value: `${stats.dailyStreak} day${stats.dailyStreak === 1 ? "" : "s"}`, inline: true },
        )
        .setFooter({ text: "Use /daily to earn coins and XP." })
        .setTimestamp();
}

export function createRankEmbed({ user, stats, rank, leaderboard, color }) {
    const levelInfo = calculateLevel(stats.xp);
    const top = leaderboard.length
        ? leaderboard.map((row, index) => `#${index + 1} ${row.userTag} — Level ${calculateLevel(row.xp).level}, ${row.xp} XP`).join("\n")
        : "No ranked members yet.";

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`${user.username}'s Rank`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(`You are ranked **#${rank}** with **${stats.xp} XP**.`)
        .addFields(
            { name: "Level Progress", value: `${levelInfo.currentLevelXp}/${levelInfo.nextLevelXp} XP`, inline: true },
            { name: "Coins", value: `${stats.coins}`, inline: true },
            { name: "Top Members", value: top },
        )
        .setTimestamp();
}

export function createDailyEmbed({ user, result, color }) {
    if (!result.claimed) {
        return new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("Daily Already Claimed")
            .setDescription(`${user}, your next daily reward is available <t:${Math.floor(result.nextDailyAt.getTime() / 1000)}:R>.`)
            .setTimestamp();
    }

    return new EmbedBuilder()
        .setColor(color)
        .setTitle("Daily Reward Claimed")
        .setDescription(`${user} collected today's community reward.`)
        .addFields(
            { name: "Coins Earned", value: `+${result.coinReward}`, inline: true },
            { name: "XP Earned", value: `+${result.xpReward}`, inline: true },
            { name: "Streak", value: `${result.stats.dailyStreak} day${result.stats.dailyStreak === 1 ? "" : "s"}`, inline: true },
            { name: "Total Coins", value: `${result.stats.coins}`, inline: true },
            { name: "Level", value: `${result.levelInfo.level}`, inline: true },
            { name: "Total XP", value: `${result.stats.xp}`, inline: true },
        )
        .setTimestamp();
}