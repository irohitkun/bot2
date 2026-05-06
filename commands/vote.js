import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, voteRecordsTable, memberStatsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

const BOT_ID = process.env.BOT_ID ?? "";
const TOPGG_TOKEN = process.env.TOPGG_TOKEN ?? "";
const VOTE_COIN_REWARD = 200;
const VOTE_XP_REWARD = 100;
const VOTE_STREAK_BONUS = 50; // extra coins per streak day

export const data = new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Vote for the bot on Top.gg and earn rewards");

export async function execute(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const userId = interaction.user.id;
    const voteUrl = `https://top.gg/bot/${BOT_ID}/vote`;

    // Check if user has voted recently via Top.gg API
    let hasVoted = false;
    let voteRecord = null;

    if (TOPGG_TOKEN) {
        try {
            const res = await fetch(`https://top.gg/api/bots/${BOT_ID}/check?userId=${userId}`, {
                headers: { Authorization: TOPGG_TOKEN },
            });
            const data = await res.json();
            hasVoted = data.voted === 1;
        } catch {}
    }

    // Get current vote record from DB
    const [record] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));

    // Check if we've already credited this vote cycle (12h window)
    const alreadyCredited = record
        && (Date.now() - record.lastVotedAt.getTime()) < 12 * 60 * 60 * 1000;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🗳️ Vote for the Bot")
        .setURL(voteUrl);

    if (hasVoted && !alreadyCredited) {
        // Credit the vote rewards
        const newStreak = (record?.voteStreak ?? 0) + 1;
        const newTotal = (record?.totalVotes ?? 0) + 1;
        const coinsEarned = VOTE_COIN_REWARD + newStreak * VOTE_STREAK_BONUS;

        await db.insert(voteRecordsTable).values({
            userId,
            lastVotedAt: new Date(),
            voteStreak: newStreak,
            totalVotes: newTotal,
        }).onConflictDoUpdate({
            target: voteRecordsTable.userId,
            set: { lastVotedAt: new Date(), voteStreak: newStreak, totalVotes: newTotal },
        });

        // Award coins and XP (if member stats exist in this guild)
        try {
            const [stats] = await db.select().from(memberStatsTable)
                .where(eq(memberStatsTable.userId, userId));
            if (stats) {
                const { sql: drizzleSql } = await import("drizzle-orm");
                await db.update(memberStatsTable).set({
                    coins: drizzleSql`${memberStatsTable.coins} + ${coinsEarned}`,
                    xp: drizzleSql`${memberStatsTable.xp} + ${VOTE_XP_REWARD}`,
                    updatedAt: new Date(),
                }).where(eq(memberStatsTable.userId, userId));
            }
        } catch {}

        embed
            .setTitle("✅ Thanks for Voting!")
            .setDescription(`You voted for the bot on Top.gg and earned rewards!\n\n**Rewards Earned:**\n🪙 **${coinsEarned} coins** (${VOTE_COIN_REWARD} base + ${newStreak * VOTE_STREAK_BONUS} streak bonus)\n⭐ **${VOTE_XP_REWARD} XP**\n\n🔥 **Vote Streak:** ${newStreak} day${newStreak !== 1 ? "s" : ""}`)
            .addFields({ name: "Total Votes", value: `${newTotal}`, inline: true })
            .setFooter({ text: "Vote again in 12 hours to keep your streak!" })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    if (alreadyCredited) {
        // Already voted and credited this cycle
        const nextVote = new Date(record.lastVotedAt.getTime() + 12 * 60 * 60 * 1000);
        embed
            .setDescription(`✅ You already voted this cycle! Come back at <t:${Math.floor(nextVote.getTime() / 1000)}:t> to vote again.\n\n🔥 **Current Streak:** ${record.voteStreak} day${record.voteStreak !== 1 ? "s" : ""}\n📊 **Total Votes:** ${record.totalVotes}\n\n[Vote on Top.gg](${voteUrl})`)
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Has not voted yet
    embed
        .setDescription(`Support the bot by voting on **Top.gg** and earn rewards!\n\n**Rewards:**\n🪙 ${VOTE_COIN_REWARD}+ coins (increases with streak)\n⭐ ${VOTE_XP_REWARD} XP\n\n[👉 Click here to vote!](${voteUrl})\n\nAfter voting, run this command again to claim your rewards.`)
        .addFields(
            { name: "Vote Streak", value: record ? `${record.voteStreak} days` : "Start now!", inline: true },
            { name: "Total Votes", value: record ? `${record.totalVotes}` : "0", inline: true },
        )
        .setFooter({ text: "Streak resets if you miss a 12-hour window" })
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}
