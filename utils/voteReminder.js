/**
   * Vote Reminder System
   * --------------------
   * DMed to opted-in users when their 12-hour vote cooldown expires.
   * Uses DB-persisted lastReminderSentAt so bot restarts do NOT re-trigger DMs.
   */

  import { EmbedBuilder } from "discord.js";
  import { db, voteRecordsTable, voteReminderOptInTable } from "../db/index.js";
  import { eq, and, lte, sql as drizzleSql } from "drizzle-orm";

  const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;       // 12 hours
  const REMINDER_FUZZ_MS = 2 * 60 * 1000;              // 2 min grace after window opens
  const POLL_INTERVAL_MS = 15 * 60 * 1000;             // check every 15 min (not 5)

  export function startVoteReminderPoller(client) {
      // Delay first poll by 1 minute to let the bot fully start
      setTimeout(() => {
          pollVoteReminders(client);
          setInterval(() => pollVoteReminders(client), POLL_INTERVAL_MS);
      }, 60 * 1000);
  }

  async function pollVoteReminders(client) {
      try {
          const cutoff = new Date(Date.now() - VOTE_COOLDOWN_MS - REMINDER_FUZZ_MS);

          // Fetch users who:
          //   1. Are opted in
          //   2. Voted more than 12h+2min ago (their window is open)
          //   3. Have NOT been reminded since their last vote (lastReminderSentAt < lastVotedAt, or null)
          const eligible = await db
              .select({
                  userId: voteReminderOptInTable.userId,
                  lastVotedAt: voteRecordsTable.lastVotedAt,
                  voteStreak: voteRecordsTable.voteStreak,
                  lastReminderSentAt: voteReminderOptInTable.lastReminderSentAt,
              })
              .from(voteReminderOptInTable)
              .innerJoin(voteRecordsTable, eq(voteReminderOptInTable.userId, voteRecordsTable.userId))
              .where(
                  and(
                      eq(voteReminderOptInTable.optedIn, true),
                      lte(voteRecordsTable.lastVotedAt, cutoff),
                  )
              );

          const botId = client.user.id;
          const voteUrl = `https://top.gg/bot/${botId}/vote`;

          for (const row of eligible) {
              if (!row.lastVotedAt) continue;

              // Skip if we already sent a reminder AFTER their last vote
              // (This is the key fix — DB-persisted, survives restarts)
              if (row.lastReminderSentAt && row.lastReminderSentAt >= row.lastVotedAt) {
                  continue;
              }

              try {
                  const user = await client.users.fetch(row.userId).catch(() => null);
                  if (!user) continue;

                  await user.send({
                      embeds: [new EmbedBuilder()
                          .setColor(0x5865f2)
                          .setTitle("🗳️ Time to Vote Again!")
                          .setDescription(
                              `Your 12-hour voting window is open! Vote for Crux to earn:

` +
                              `🪙 **200+ coins** (your streak bonus: +${(row.voteStreak ?? 0) * 50} extra)
` +
                              `⭐ **100 XP**
` +
                              `🏆 **16 hours of Premium** for any server you choose

` +
                              `[👉 Vote on Top.gg](${voteUrl})

` +
                              `After voting run \`/vote check\` to claim. Run \`/vote remind\` to turn off these DMs.`
                          )
                          .addFields({ name: "Current Streak", value: `🔥 ${row.voteStreak ?? 0}`, inline: true })
                          .setFooter({ text: "Turn off reminders with /vote remind" })
                          .setTimestamp()],
                  }).catch(() => {
                      // DM failed (user has DMs closed) — skip silently
                      return;
                  });

                  // Mark reminder as sent in DB — survives restarts
                  await db
                      .update(voteReminderOptInTable)
                      .set({ lastReminderSentAt: new Date(), updatedAt: new Date() })
                      .where(eq(voteReminderOptInTable.userId, row.userId));

                  console.log(`[VoteReminder] Sent reminder to ${user.tag}`);
              } catch (err) {
                  console.warn(`[VoteReminder] Failed for user ${row.userId}:`, err.message);
              }
          }
      } catch (err) {
          console.error("[VoteReminder] Poll error:", err);
      }
  }
  