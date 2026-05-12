import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { db, voteRecordsTable, memberStatsTable, premiumGuildsTable, voteReminderOptInTable } from "../db/index.js";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { invalidatePremiumCache } from "../utils/permissions.js";
import { TOPGG_URL } from "../config/constants.js";

const VOTE_COIN_REWARD = 200;
const VOTE_XP_REWARD = 100;
const VOTE_STREAK_BONUS = 50;
const VOTE_PREMIUM_HOURS = 16;
const VOTE_PREMIUM_MS = VOTE_PREMIUM_HOURS * 60 * 60 * 1000;
const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Vote for Crux on Top.gg — earn rewards and unlock 16h of Premium for your server")
    .addSubcommand((sub) =>
        sub.setName("check")
            .setDescription("Check if you've voted and claim your rewards"))
    .addSubcommand((sub) =>
        sub.setName("remind")
            .setDescription("Toggle vote reminders — get a DM when you can vote again"))
    .addSubcommand((sub) =>
        sub.setName("status")
            .setDescription("View your vote streak and total votes"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "check") return handleCheck(interaction);
    if (sub === "remind") return handleRemind(interaction);
    if (sub === "status") return handleStatus(interaction);
}

async function handleCheck(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const userId = interaction.user.id;
    const botId = interaction.client.user.id;
    const voteUrl = `https://top.gg/bot/${botId}/vote`;
    const TOPGG_TOKEN = process.env.TOPGG_TOKEN ?? "";

    let hasVoted = false;
    if (TOPGG_TOKEN) {
        try {
            const res = await fetch(`https://top.gg/api/bots/${botId}/check?userId=${userId}`, {
                headers: { Authorization: TOPGG_TOKEN },
            });
            const data = await res.json();
            hasVoted = data.voted === 1;
        } catch {}
    }

    const [record] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));
    const alreadyCredited = record && (Date.now() - record.lastVotedAt.getTime()) < VOTE_COOLDOWN_MS;

    if (alreadyCredited) {
        const nextVote = new Date(record.lastVotedAt.getTime() + VOTE_COOLDOWN_MS);
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle("🗳️ Already Voted This Cycle")
            .setURL(voteUrl)
            .setDescription(
                `✅ You already voted this cycle! Come back <t:${Math.floor(nextVote.getTime() / 1000)}:R> to vote again.\n\n` +
                `🔥 **Current Streak:** ${record.voteStreak} day${record.voteStreak !== 1 ? "s" : ""}\n` +
                `📊 **Total Votes:** ${record.totalVotes}\n\n` +
                `[Vote again at Top.gg](${voteUrl})`
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (!hasVoted) {
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle("🗳️ Vote for Crux on Top.gg")
            .setURL(voteUrl)
            .setDescription(
                `Support Crux by voting on **Top.gg** every 12 hours!\n\n` +
                `**What you earn:**\n` +
                `🪙 ${VOTE_COIN_REWARD}+ coins (increases with streak)\n` +
                `⭐ ${VOTE_XP_REWARD} XP\n` +
                `🏆 **${VOTE_PREMIUM_HOURS} hours of Premium** for a server of your choice\n\n` +
                `[👉 Click here to vote!](${voteUrl})\n\n` +
                `After voting, run \`/vote check\` to claim your rewards and pick which server gets Premium.`
            )
            .addFields(
                { name: "Vote Streak", value: record ? `🔥 ${record.voteStreak} days` : "Start now!", inline: true },
                { name: "Total Votes", value: record ? `${record.totalVotes}` : "0", inline: true },
            )
            .setFooter({ text: "Streak resets if you miss a 12-hour window" })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel("Vote on Top.gg").setEmoji("🗳️").setStyle(ButtonStyle.Link).setURL(voteUrl),
        );
        return interaction.reply({ embeds: [embed], components: [row] });
    }

    // Has voted and not credited yet — credit rewards + let them pick a server
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

    // Award coins and XP in current guild
    try {
        const [stats] = await db.select().from(memberStatsTable)
            .where(eq(memberStatsTable.userId, userId));
        if (stats) {
            await db.update(memberStatsTable).set({
                coins: drizzleSql`${memberStatsTable.coins} + ${coinsEarned}`,
                xp: drizzleSql`${memberStatsTable.xp} + ${VOTE_XP_REWARD}`,
                updatedAt: new Date(),
            }).where(eq(memberStatsTable.userId, userId));
        }
    } catch {}

    // Build server selection — show all mutual guilds the bot is in
    const mutualGuilds = interaction.client.guilds.cache.filter((g) => g.members.cache.has(userId) || g.ownerId === userId);

    const expiresAt = new Date(Date.now() + VOTE_PREMIUM_MS);

    if (mutualGuilds.size === 0) {
        // Fallback: activate for current guild
        await activatePremiumForGuild(interaction.guild.id, userId, interaction.user.tag, expiresAt);
        const embed = buildVoteSuccessEmbed(color, voteUrl, coinsEarned, newStreak, newTotal, interaction.guild.name, expiresAt);
        return interaction.reply({ embeds: [embed] });
    }

    if (mutualGuilds.size === 1) {
        await activatePremiumForGuild(interaction.guild.id, userId, interaction.user.tag, expiresAt);
        const embed = buildVoteSuccessEmbed(color, voteUrl, coinsEarned, newStreak, newTotal, interaction.guild.name, expiresAt);
        return interaction.reply({ embeds: [embed] });
    }

    // Multiple mutual guilds — let them choose
    const options = mutualGuilds
        .first(25)
        .map((g) => new StringSelectMenuOptionBuilder()
            .setLabel(g.name.slice(0, 100))
            .setValue(g.id)
            .setDescription(`Apply ${VOTE_PREMIUM_HOURS}h Premium to ${g.name.slice(0, 50)}`)
        );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`vote:server:${userId}:${expiresAt.getTime()}`)
        .setPlaceholder("Choose which server gets Premium...")
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("✅ Thanks for Voting!")
        .setDescription(
            `**Rewards Earned:**\n🪙 **${coinsEarned} coins** (${VOTE_COIN_REWARD} base + ${newStreak * VOTE_STREAK_BONUS} streak bonus)\n⭐ **${VOTE_XP_REWARD} XP**\n\n` +
            `🏆 **${VOTE_PREMIUM_HOURS}h of Premium** is yours — select which server below!\n\n` +
            `> Note: Each vote gives Premium to **one server** of your choice. You can pick a different server each time.`
        )
        .addFields(
            { name: "Vote Streak", value: `🔥 ${newStreak} day${newStreak !== 1 ? "s" : ""}`, inline: true },
            { name: "Total Votes", value: `${newTotal}`, inline: true },
        )
        .setFooter({ text: "Selection expires in 5 minutes. Vote again in 12 hours!" })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleRemind(interaction) {
    const userId = interaction.user.id;
    const [existing] = await db.select().from(voteReminderOptInTable).where(eq(voteReminderOptInTable.userId, userId));

    const newState = existing ? !existing.optedIn : true;

    await db.insert(voteReminderOptInTable).values({ userId, optedIn: newState }).onConflictDoUpdate({
        target: voteReminderOptInTable.userId,
        set: { optedIn: newState, updatedAt: new Date() },
    });

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(newState ? 0x57f287 : 0x95a5a6)
            .setTitle(newState ? "🔔 Vote Reminders Enabled" : "🔕 Vote Reminders Disabled")
            .setDescription(newState
                ? "I'll DM you when you can vote again (every 12 hours). Make sure your DMs are open from server members!"
                : "You won't receive vote reminder DMs anymore. Run `/vote remind` again to re-enable.")
            .setTimestamp()],
        flags: 64,
    });
}

async function handleStatus(interaction) {
    const userId = interaction.user.id;
    const botId = interaction.client.user.id;
    const { color } = await getGuildStyle(interaction.guild.id);
    const [record] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));

    const voteUrl = `https://top.gg/bot/${botId}/vote`;
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🗳️ Your Vote Status")
        .setURL(voteUrl);

    if (!record) {
        embed.setDescription(`You haven't voted yet!\n\n[Vote on Top.gg](${voteUrl}) to earn coins, XP, and **${VOTE_PREMIUM_HOURS}h of Premium** for a server of your choice.`);
    } else {
        const nextVote = new Date(record.lastVotedAt.getTime() + VOTE_COOLDOWN_MS);
        const canVote = Date.now() >= nextVote.getTime();
        embed.addFields(
            { name: "Vote Streak", value: `🔥 ${record.voteStreak} days`, inline: true },
            { name: "Total Votes", value: `${record.totalVotes}`, inline: true },
            { name: "Last Voted", value: `<t:${Math.floor(record.lastVotedAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Next Vote", value: canVote ? "✅ Ready now!" : `<t:${Math.floor(nextVote.getTime() / 1000)}:R>`, inline: true },
        );
    }
    embed.setFooter({ text: `Each vote earns coins, XP, and ${VOTE_PREMIUM_HOURS}h Premium for one server` });
    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function activatePremiumForGuild(guildId, userId, userTag, expiresAt) {
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
        notes: `Vote-based premium (${VOTE_PREMIUM_HOURS}h) activated by ${userTag}`,
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
            notes: `Vote-based premium (${VOTE_PREMIUM_HOURS}h) activated by ${userTag}`,
        },
    });
    invalidatePremiumCache(guildId);
}

function buildVoteSuccessEmbed(color, voteUrl, coinsEarned, streak, total, guildName, expiresAt) {
    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("✅ Thanks for Voting!")
        .setURL(voteUrl)
        .setDescription(
            `**Rewards Earned:**\n🪙 **${coinsEarned} coins**\n⭐ **100 XP**\n🏆 **${VOTE_PREMIUM_HOURS}h Premium** → applied to **${guildName}**`
        )
        .addFields(
            { name: "Premium Active Until", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Vote Streak", value: `🔥 ${streak} day${streak !== 1 ? "s" : ""}`, inline: true },
            { name: "Total Votes", value: `${total}`, inline: true },
        )
        .setFooter({ text: "Vote again in 12 hours to keep your streak!" })
        .setTimestamp();
}

export { activatePremiumForGuild, VOTE_PREMIUM_MS, VOTE_PREMIUM_HOURS };
