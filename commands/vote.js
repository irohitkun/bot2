import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
  import { db, voteRecordsTable, memberStatsTable, premiumGuildsTable, voteReminderOptInTable } from "../db/index.js";
  import { eq, sql as drizzleSql } from "drizzle-orm";
  import { getGuildStyle } from "../utils/guildStyle.js";
  import { invalidatePremiumCache } from "../utils/permissions.js";
  import { TOPGG_URL } from "../config/constants.js";
import { scheduleVoteReminder } from "../utils/voteReminder.js";

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
              .setDescription("Check if you've voted and claim your rewards + activate Premium"))
      .addSubcommand((sub) =>
          sub.setName("remind")
              .setDescription("Toggle vote reminders — get a DM when you can vote again"))
      .addSubcommand((sub) =>
          sub.setName("status")
              .setDescription("View your vote streak, total votes, and current server premium status"));

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
          const [premium] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, interaction.guild.id));
          const hasPremium = premium && (!premium.expiresAt || premium.expiresAt > new Date());

          const embed = new EmbedBuilder()
              .setColor(color)
              .setTitle("🗳️ Already Voted This Cycle")
              .setURL(voteUrl)
              .setDescription(
                  `✅ You already voted! You can vote again <t:${Math.floor(nextVote.getTime() / 1000)}:R>.

` +
                  `🔥 **Streak:** ${record.voteStreak} vote${record.voteStreak !== 1 ? "s" : ""}  |  📊 **Total:** ${record.totalVotes}`
              )
              .addFields({
                  name: "⭐ This Server's Premium",
                  value: hasPremium
                      ? `Active — expires <t:${Math.floor(premium.expiresAt.getTime() / 1000)}:R>`
                      : `Not active. Vote again and run \`/vote check\` to apply **${VOTE_PREMIUM_HOURS}h Premium** to this server!`,
                  inline: false,
              })
              .setFooter({ text: "Tip: Run /premium status to see full premium info" })
              .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
      }

      if (!hasVoted) {
          const [premium] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, interaction.guild.id));
          const hasPremium = premium && (!premium.expiresAt || premium.expiresAt > new Date());

          const embed = new EmbedBuilder()
              .setColor(color)
              .setTitle("🗳️ Vote for Crux — Unlock Free Premium!")
              .setURL(voteUrl)
              .setDescription(
                  `Support Crux by voting on **Top.gg** every 12 hours and earn real rewards!

` +
                  `**🎁 What you earn per vote:**
` +
                  `🪙 ${VOTE_COIN_REWARD}+ coins (streak bonus stacks)
` +
                  `⭐ ${VOTE_XP_REWARD} XP
` +
                  `🏆 **${VOTE_PREMIUM_HOURS} hours of Premium** for any server of your choice

` +
                  `**How to activate Premium after voting:**
` +
                  `1️⃣ Click the button below and vote on Top.gg
` +
                  `2️⃣ Come back and run \`/vote check\` — rewards are applied instantly
` +
                  `3️⃣ If you're in multiple servers, pick which one gets Premium
` +
                  `4️⃣ Run \`/premium status\` to confirm it's active

` +
                  `> You can pick a **different server every time** you vote!`
              )
              .addFields(
                  {
                      name: "⭐ This Server's Premium",
                      value: hasPremium
                          ? `✅ Active — expires <t:${Math.floor(premium.expiresAt.getTime() / 1000)}:R>`
                          : `❌ Not active — vote and run \`/vote check\` to unlock ${VOTE_PREMIUM_HOURS}h!`,
                      inline: false,
                  },
                  { name: "Your Streak", value: record ? `🔥 ${record.voteStreak}` : "Start now!", inline: true },
                  { name: "Total Votes", value: record ? `${record.totalVotes}` : "0", inline: true },
              )
              .setFooter({ text: "Voting is free and takes 5 seconds. Streak resets if you miss 12h window." })
              .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setLabel("Vote on Top.gg").setEmoji("🗳️").setStyle(ButtonStyle.Link).setURL(voteUrl),
          );
          return interaction.reply({ embeds: [embed], components: [row] });
      }

      // Has voted and not credited yet — credit + pick server
      // Reset streak if last vote was more than 36h ago (missed a voting window)
      const STREAK_RESET_WINDOW_MS = 36 * 60 * 60 * 1000;
      const streakExpired = record?.lastVotedAt
          ? Date.now() - record.lastVotedAt.getTime() > STREAK_RESET_WINDOW_MS
          : false;
      const newStreak = record && !streakExpired ? (record.voteStreak ?? 0) + 1 : 1;
      const newTotal = (record?.totalVotes ?? 0) + 1;
      const coinsEarned = VOTE_COIN_REWARD + newStreak * VOTE_STREAK_BONUS;

      await db.insert(voteRecordsTable).values({
          userId, lastVotedAt: new Date(), voteStreak: newStreak, totalVotes: newTotal,
      }).onConflictDoUpdate({
          target: voteRecordsTable.userId,
          set: { lastVotedAt: new Date(), voteStreak: newStreak, totalVotes: newTotal },
      });

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

      const mutualGuilds = interaction.client.guilds.cache.filter((g) => g.members.cache.has(userId) || g.ownerId === userId);
      const expiresAt = new Date(Date.now() + VOTE_PREMIUM_MS);

      if (mutualGuilds.size <= 1) {
          await activatePremiumForGuild(interaction.guild.id, userId, interaction.user.tag, expiresAt);
          return interaction.reply({ embeds: [buildVoteSuccessEmbed(color, voteUrl, coinsEarned, newStreak, newTotal, interaction.guild.name, expiresAt)] });
      }

      const options = mutualGuilds.first(25).map((g) =>
          new StringSelectMenuOptionBuilder()
              .setLabel(g.name.slice(0, 100))
              .setValue(g.id)
              .setDescription(`Apply ${VOTE_PREMIUM_HOURS}h Premium to ${g.name.slice(0, 50)}`)
      );

      const menu = new StringSelectMenuBuilder()
          .setCustomId(`vote:server:${userId}:${expiresAt.getTime()}`)
          .setPlaceholder("Choose which server gets 16h Premium…")
          .addOptions(options);

      const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("✅ Thanks for Voting! Pick Your Server")
          .setDescription(
              `**Rewards Earned:**
` +
              `🪙 **${coinsEarned} coins** (${VOTE_COIN_REWARD} base + ${newStreak * VOTE_STREAK_BONUS} streak bonus)
` +
              `⭐ **${VOTE_XP_REWARD} XP**
` +
              `🏆 **${VOTE_PREMIUM_HOURS}h of Premium** — pick which server gets it below!

` +
              `**How Premium works:**
` +
              `→ The selected server gets all premium features for 16 hours
` +
              `→ Vote again in 12 hours to give any server another 16h
` +
              `→ Run \`/premium status\` in that server to confirm`
          )
          .addFields(
              { name: "Vote Streak", value: `🔥 ${newStreak}`, inline: true },
              { name: "Total Votes", value: `${newTotal}`, inline: true },
          )
          .setFooter({ text: "Selection expires in 5 minutes" })
          .setTimestamp();

      scheduleVoteReminder(interaction.client, userId, newStreak);
        await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
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
              .setTitle(newState ? "🔔 Vote Reminders On" : "🔕 Vote Reminders Off")
              .setDescription(newState
                  ? "I'll DM you when your 12-hour voting window opens again. Make sure your DMs are open!"
                  : "No more vote reminder DMs. Run `/vote remind` again to re-enable.")
              .setTimestamp()],
          flags: 64,
      });
  }

  async function handleStatus(interaction) {
      const userId = interaction.user.id;
      const botId = interaction.client.user.id;
      const { color } = await getGuildStyle(interaction.guild.id);
      const voteUrl = `https://top.gg/bot/${botId}/vote`;

      const [[record], [premium]] = await Promise.all([
          db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId)),
          db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, interaction.guild.id)),
      ]);

      const hasPremium = premium && (!premium.expiresAt || premium.expiresAt > new Date());

      const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle("🗳️ Vote Status")
          .setURL(voteUrl);

      if (!record) {
          embed.setDescription(
              `You haven't voted yet!

[Vote on Top.gg](${voteUrl}) to earn coins, XP, and **${VOTE_PREMIUM_HOURS}h of Premium** for any server.

` +
              `**After voting:**
1. Run \`/vote check\` to claim rewards
2. Pick which server gets Premium
3. Run \`/premium status\` to confirm`
          );
      } else {
          const nextVote = new Date(record.lastVotedAt.getTime() + VOTE_COOLDOWN_MS);
          const canVote = Date.now() >= nextVote.getTime();
          embed.addFields(
              { name: "Vote Streak", value: `🔥 ${record.voteStreak}`, inline: true },
              { name: "Total Votes", value: `${record.totalVotes}`, inline: true },
              { name: "Next Vote", value: canVote ? "✅ Ready now!" : `<t:${Math.floor(nextVote.getTime() / 1000)}:R>`, inline: true },
              {
                  name: "⭐ Premium — This Server",
                  value: hasPremium
                      ? `✅ Active — expires <t:${Math.floor(premium.expiresAt.getTime() / 1000)}:R>
Activated by: <@${premium.activatedBy}>`
                      : `❌ Not active
→ Vote and run \`/vote check\` to unlock **${VOTE_PREMIUM_HOURS}h of Premium**!`,
                  inline: false,
              },
          );
      }

      embed.setFooter({ text: `Each vote = ${VOTE_PREMIUM_HOURS}h Premium for any server • Vote every 12h to keep streaks` });
      const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Vote on Top.gg").setEmoji("🗳️").setStyle(ButtonStyle.Link).setURL(voteUrl),
      );
      return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  }

  async function activatePremiumForGuild(guildId, userId, userTag, expiresAt) {
      await db.insert(premiumGuildsTable).values({
          guildId, activatedBy: userId, activatedByTag: userTag, expiresAt,
          tier: "premium", isTrial: false, reminderSent: false, notifyUserId: userId,
          activationMethod: "vote",
          notes: `Vote-based premium (${VOTE_PREMIUM_HOURS}h) activated by ${userTag}`,
      }).onConflictDoUpdate({
          target: premiumGuildsTable.guildId,
          set: {
              activatedBy: userId, activatedByTag: userTag, activatedAt: new Date(), expiresAt,
              tier: "premium", isTrial: false, reminderSent: false, notifyUserId: userId,
              activationMethod: "vote",
              notes: `Vote-based premium (${VOTE_PREMIUM_HOURS}h) activated by ${userTag}`,
          },
      });
      invalidatePremiumCache(guildId);
  }

  function buildVoteSuccessEmbed(color, voteUrl, coinsEarned, streak, total, guildName, expiresAt) {
      return new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("✅ Vote Rewards Claimed!")
          .setURL(voteUrl)
          .setDescription(
              `**Earned:**  🪙 ${coinsEarned} coins  •  ⭐ 100 XP  •  🏆 ${VOTE_PREMIUM_HOURS}h Premium

` +
              `**${guildName}** now has **${VOTE_PREMIUM_HOURS} hours of Premium!**
` +
              `Run \`/premium status\` to see all active features.`
          )
          .addFields(
              { name: "Premium Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
              { name: "Streak", value: `🔥 ${streak}`, inline: true },
              { name: "Total Votes", value: `${total}`, inline: true },
          )
          .setFooter({ text: "Vote again in 12h to give any server another 16h of Premium!" })
          .setTimestamp();
  }

  export { activatePremiumForGuild, VOTE_PREMIUM_MS, VOTE_PREMIUM_HOURS };
  