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

  export function registerTopggWebhook(app, client) {
      app.post("/topgg/webhook", async (req, res) => {
          console.log("[TopGG] INCOMING REQUEST to /topgg/webhook");
          console.log("[TopGG] Headers:", JSON.stringify(req.headers));
          console.log("[TopGG] Body:", JSON.stringify(req.body));
          const secret = process.env.TOPGG_WEBHOOK_SECRET;
          if (secret && req.headers.authorization !== secret) {
              console.warn("[TopGG] REJECTED — expected auth but got:", req.headers.authorization);
              return res.status(401).send("Unauthorized");
          }
          res.sendStatus(200);
          try {
              const { user: userId, type } = req.body ?? {};
              console.log(`[TopGG] Incoming webhook — type: ${type}, userId: ${userId}`);
              if (!userId || type !== "upvote") {
                  console.log(`[TopGG] Ignoring non-upvote event: type=${type}`);
                  return;
              }
              await processVote(client, userId);
          } catch (err) {
              console.error("[TopGG] Error processing vote:", err);
          }
      });
      console.log("[TopGG Webhook] Registered POST /topgg/webhook");
  }

  async function processVote(client, userId) {
      const botId = client.user.id;
      const voteUrl = `https://top.gg/bot/${botId}/vote`;

      console.log(`[TopGG] Processing vote from userId: ${userId}`);

      const [existing] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));
      const streak = existing ? (existing.voteStreak ?? 0) + 1 : 1;
      const total = existing ? (existing.totalVotes ?? 0) + 1 : 1;
      const lastVotedAt = new Date();

      await db.insert(voteRecordsTable)
          .values({ userId, lastVotedAt, voteStreak: streak, totalVotes: total })
          .onConflictDoUpdate({
              target: voteRecordsTable.userId,
              set: { lastVotedAt, voteStreak: streak, totalVotes: total },
          });

      const coinsEarned = VOTE_COIN_REWARD + streak * VOTE_STREAK_BONUS;
      try {
          await db.update(memberStatsTable).set({
              coins: drizzleSql`${memberStatsTable.coins} + ${coinsEarned}`,
              xp: drizzleSql`${memberStatsTable.xp} + ${VOTE_XP_REWARD}`,
              updatedAt: new Date(),
          }).where(eq(memberStatsTable.userId, userId));
      } catch (e) {
          console.warn("[TopGG] Could not credit coins/XP:", e.message);
      }

      const mutualGuilds = [];
      for (const guild of client.guilds.cache.values()) {
          const member = guild.members.cache.get(userId)
              ?? await guild.members.fetch(userId).catch(() => null);
          if (member) mutualGuilds.push(guild);
      }
      console.log(`[TopGG] Mutual guilds for ${userId}: ${mutualGuilds.map(g => g.name).join(", ") || "none"}`);

      const expiresAt = new Date(Date.now() + VOTE_PREMIUM_MS);

      // DM voter + schedule one-shot reminder
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
                          `Run \`/premium status\` in that server to confirm.\n` +
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

          // ── ONE-SHOT REMINDER (no polling, replaces old setTimeout block) ────────
          try {
              const [optIn] = await db.select().from(voteReminderOptInTable).where(eq(voteReminderOptInTable.userId, userId));
              if (optIn?.optedIn !== false) {
                  scheduleVoteReminder(client, userId, streak);
              }
          } catch {}
      }

      // Log channel + owner DMs
      const logEmbed = new EmbedBuilder().setColor(0x5865f2).setTitle("🗳️ New Vote!")
          .addFields(
              { name: "User", value: user ? `${user.tag} (<@${userId}>)` : userId, inline: true },
              { name: "Streak", value: `🔥 ${streak}`, inline: true },
              { name: "Total Votes", value: `${total}`, inline: true },
              { name: "Coins Earned", value: `🪙 ${coinsEarned}`, inline: true },
              { name: "Server Premium", value: mutualGuilds.length > 0 ? `Offered to ${mutualGuilds.length} guild(s): ${mutualGuilds.map(g => g.name).join(", ").slice(0, 200)}` : "No shared servers", inline: false },
          ).setTimestamp();

      const logChannelId = process.env.VOTE_LOG_CHANNEL_ID;
      if (logChannelId) {
          try {
              let ch = client.channels.cache.get(logChannelId);
              if (!ch) ch = await client.channels.fetch(logChannelId);
              if (ch?.isTextBased()) { await ch.send({ embeds: [logEmbed] }); console.log(`[TopGG] Vote log sent to channel ${logChannelId}`); }
              else console.warn(`[TopGG] VOTE_LOG_CHANNEL_ID ${logChannelId} not a text channel`);
          } catch (e) { console.error(`[TopGG] Failed to send vote log to channel ${logChannelId}:`, e.message); }
      } else { console.log("[TopGG] VOTE_LOG_CHANNEL_ID not set — skipping channel log"); }

      const ownerIds = [...new Set([...(process.env.BOT_OWNERS ?? "").split(",").map((s) => s.trim()).filter(Boolean), "1298631508533313536"])];
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
          notes: `Vote webhook — ${VOTE_PREMIUM_HOURS}h premium granted automatically`,
      }).onConflictDoUpdate({
          target: premiumGuildsTable.guildId,
          set: {
              activatedBy: userId, activatedByTag: userTag, activatedAt: new Date(), expiresAt,
              tier: "premium", isTrial: false, reminderSent: false, notifyUserId: userId,
              activationMethod: "vote",
              notes: `Vote webhook — ${VOTE_PREMIUM_HOURS}h premium granted automatically`,
          },
      });
      invalidatePremiumCache(guildId);
      console.log(`[TopGG] Premium activated for guild ${guildId} until ${expiresAt.toISOString()}`);
  }
  