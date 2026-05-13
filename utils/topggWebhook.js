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

  /**
   * Register the Top.gg vote webhook on an Express app.
   * Top.gg sends a POST with JSON body: { user: "<userId>", type: "upvote", isWeekend?: boolean }
   */
  export function registerTopggWebhook(app, client) {
      app.post("/topgg/webhook", async (req, res) => {
          // ── Auth check ───────────────────────────────────────────────────────
          const secret = process.env.TOPGG_WEBHOOK_SECRET;
          const incomingAuth = req.headers?.authorization ?? req.headers?.["x-topgg-authorization"] ?? "";
          if (secret && incomingAuth !== secret) {
              console.warn(`[TopGG] Auth mismatch. Expected secret set, got header: ${incomingAuth.slice(0, 20)}...`);
              return res.status(401).json({ error: "Unauthorized" });
          }
          if (!secret) {
              console.warn("[TopGG] TOPGG_WEBHOOK_SECRET is not set — accepting vote without auth verification!");
          }

          // Acknowledge immediately so Top.gg doesn't retry
          res.status(200).json({ ok: true });

          // ── Parse body ───────────────────────────────────────────────────────
          const { user: userId, type, isWeekend } = req.body ?? {};
          if (!userId) {
              console.warn("[TopGG] Missing userId in webhook body:", JSON.stringify(req.body));
              return;
          }
          if (type === "test") {
              console.log(`[TopGG] ✅ Test ping received — webhook connectivity confirmed! userId: ${userId}`);
              return; // test pings don't process a real vote
          }
          if (type !== "upvote") {
              console.log(`[TopGG] Ignoring unknown event type: ${type}`);
              return;
          }

          console.log(`[TopGG] ✅ Real upvote received from user ${userId} — processing...`);
          await processVote(client, userId, !!isWeekend);
      });

      console.log("[TopGG Webhook] Listening on POST /topgg/webhook");
  }

  async function processVote(client, userId, isWeekend) {
      const botId = client.user.id;
      const voteUrl = `https://top.gg/bot/${botId}/vote`;

      // ── 1. Update vote record ──────────────────────────────────────────────
      const [existing] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));
      const streak = existing ? (existing.voteStreak ?? 0) + 1 : 1;
      const total = existing ? (existing.totalVotes ?? 0) + 1 : 1;

      await db.insert(voteRecordsTable)
          .values({ userId, lastVotedAt: new Date(), voteStreak: streak, totalVotes: total })
          .onConflictDoUpdate({
              target: voteRecordsTable.userId,
              set: { lastVotedAt: new Date(), voteStreak: streak, totalVotes: total },
          });

      // ── 2. Credit coins + XP ────────────────────────────────────────────
      const coinsEarned = VOTE_COIN_REWARD + streak * VOTE_STREAK_BONUS;
      try {
          await db.update(memberStatsTable).set({
              coins: drizzleSql`${memberStatsTable.coins} + ${coinsEarned}`,
              xp: drizzleSql`${memberStatsTable.xp} + ${VOTE_XP_REWARD}`,
              updatedAt: new Date(),
          }).where(eq(memberStatsTable.userId, userId));
      } catch (e) {
          console.warn("[TopGG] Coins/XP credit failed:", e.message);
      }

      // ── 3. Resolve mutual guilds ────────────────────────────────────────────
      const mutualGuilds = [];
      for (const guild of client.guilds.cache.values()) {
          const member = guild.members.cache.get(userId)
              ?? await guild.members.fetch(userId).catch(() => null);
          if (member) mutualGuilds.push(guild);
      }
      const expiresAt = new Date(Date.now() + VOTE_PREMIUM_MS);

      // ── 4. DM voter ─────────────────────────────────────────────────────────
      const user = await client.users.fetch(userId).catch(() => null);
      if (user) {
          try {
              if (mutualGuilds.length === 0) {
                  await user.send({ embeds: [new EmbedBuilder()
                      .setColor(0xf1c40f).setTitle("✅ Thanks for Voting!")
                      .setURL(voteUrl)
                      .setDescription(`**Rewards:**\n🪙 ${coinsEarned} coins  •  ⭐ ${VOTE_XP_REWARD} XP  •  🏆 ${VOTE_PREMIUM_HOURS}h Premium\n\n` +
                          `You're not in any server with Crux. Join one, then run \`/vote check\`.\n\n` +
                          `🔥 Streak: **${streak}**  |  Total: **${total}**`).setTimestamp()] }).catch(() => {});

              } else if (mutualGuilds.length === 1) {
                  await activatePremium(mutualGuilds[0].id, userId, user.tag, expiresAt);
                  await user.send({ embeds: [new EmbedBuilder()
                      .setColor(0xf1c40f).setTitle("✅ Thanks for Voting!")
                      .setURL(voteUrl)
                      .setDescription(`**Rewards:**\n🪙 ${coinsEarned} coins  •  ⭐ ${VOTE_XP_REWARD} XP\n🏆 **${VOTE_PREMIUM_HOURS}h Premium** → applied to **${mutualGuilds[0].name}**!\n\n` +
                          `Run \`/premium status\` to confirm.\n` +
                          `🔥 Streak: **${streak}**  |  Total: **${total}**  |  Vote again in 12h!`)
                          .addFields({ name: "Premium Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }).setTimestamp()] }).catch(() => {});

              } else {
                  const options = mutualGuilds.slice(0, 25).map((g) =>
                      new StringSelectMenuOptionBuilder().setLabel(g.name.slice(0, 100)).setValue(g.id).setDescription(`Give ${VOTE_PREMIUM_HOURS}h Premium to this server`)
                  );
                  const menu = new StringSelectMenuBuilder()
                      .setCustomId(`vote:server:${userId}:${expiresAt.getTime()}`)
                      .setPlaceholder("Pick which server gets 16h Premium…")
                      .addOptions(options);
                  await user.send({
                      embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle("✅ Thanks for Voting! Pick Your Server")
                          .setURL(voteUrl)
                          .setDescription(`**Rewards:**\n🪙 ${coinsEarned} coins  •  ⭐ ${VOTE_XP_REWARD} XP\n🏆 **${VOTE_PREMIUM_HOURS}h Premium** — you're in **${mutualGuilds.length}** servers. Pick one below!\n\n` +
                              `After selecting, run \`/premium status\` to confirm.\n` +
                              `🔥 Streak: **${streak}**  |  Total: **${total}**`)
                              .setFooter({ text: "Selection expires in 5 minutes" }).setTimestamp()],
                      components: [new ActionRowBuilder().addComponents(menu)],
                  }).catch(() => {});
              }
          } catch (e) { console.warn("[TopGG] Failed to DM voter:", e.message); }

          // One-shot reminder
          try {
              const [optIn] = await db.select().from(voteReminderOptInTable).where(eq(voteReminderOptInTable.userId, userId));
              if (optIn?.optedIn !== false) scheduleVoteReminder(client, userId, streak);
          } catch {}
      }

      // ── 5. Vote log channel + owner DMs ──────────────────────────────────────
      const logEmbed = new EmbedBuilder().setColor(0x5865f2).setTitle("🗳️ New Vote!")
          .addFields(
              { name: "User", value: user ? `${user.tag} (<@${userId}>)` : userId, inline: true },
              { name: "Weekend", value: isWeekend ? "✅ Yes" : "No", inline: true },
              { name: "Streak", value: `🔥 ${streak}`, inline: true },
              { name: "Total Votes", value: `${total}`, inline: true },
              { name: "Coins Earned", value: `🪙 ${coinsEarned}`, inline: true },
              { name: "Server Premium", value: mutualGuilds.length > 0 ? `Offered to ${mutualGuilds.length} guild(s)` : "No shared servers", inline: false },
          ).setTimestamp();

      const logChannelId = process.env.VOTE_LOG_CHANNEL_ID;
      if (logChannelId) {
          try {
              const ch = await client.channels.fetch(logChannelId).catch(() => null);
              if (ch?.isTextBased()) {
                  await ch.send({ embeds: [logEmbed] });
                  console.log(`[TopGG] Vote log sent to channel ${logChannelId}`);
              } else {
                  console.warn(`[TopGG] VOTE_LOG_CHANNEL_ID ${logChannelId} is not a text channel`);
              }
          } catch (e) {
              console.error(`[TopGG] Failed to send vote log to channel ${logChannelId}:`, e.message);
          }
      } else {
          console.log("[TopGG] VOTE_LOG_CHANNEL_ID not set — skipping channel log");
      }

      const ownerIds = [...new Set([...(process.env.BOT_OWNERS ?? "").split(",").map(s => s.trim()).filter(Boolean), "1298631508533313536"])];
      for (const ownerId of ownerIds) {
          if (ownerId === userId) continue;
          try { const owner = await client.users.fetch(ownerId); await owner.send({ embeds: [logEmbed] }); }
          catch (e) { console.warn(`[TopGG] Could not DM owner ${ownerId}:`, e.message); }
      }

      console.log(`[TopGG] Vote fully processed for ${userId}`);
  }

  async function activatePremium(guildId, userId, userTag, expiresAt) {
      await db.insert(premiumGuildsTable).values({
          guildId, activatedBy: userId, activatedByTag: userTag, expiresAt,
          tier: "premium", isTrial: false, reminderSent: false, notifyUserId: userId,
          activationMethod: "vote",
          notes: `Vote — ${VOTE_PREMIUM_HOURS}h premium granted`,
      }).onConflictDoUpdate({
          target: premiumGuildsTable.guildId,
          set: {
              activatedBy: userId, activatedByTag: userTag, activatedAt: new Date(), expiresAt,
              tier: "premium", isTrial: false, reminderSent: false, notifyUserId: userId,
              activationMethod: "vote",
              notes: `Vote — ${VOTE_PREMIUM_HOURS}h premium granted`,
          },
      });
      invalidatePremiumCache(guildId);
      console.log(`[TopGG] Premium activated for guild ${guildId} until ${expiresAt.toISOString()}`);
  }
  