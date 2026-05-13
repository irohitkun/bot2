/**
   * Vote Reminder System
   * --------------------
   * NO polling, NO restart spam.
   *
   * When a vote is processed (webhook or /vote check), scheduleVoteReminder()
   * creates a single setTimeout for exactly 12 hours later.
   * If the bot restarts, the timer is lost but nothing re-fires — 
   * worst case: one missed reminder. The user runs /vote status anytime.
   */

  import { EmbedBuilder } from "discord.js";
  import { db, voteRecordsTable, voteReminderOptInTable } from "../db/index.js";
  import { eq } from "drizzle-orm";

  const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
  const REMINDER_DELAY_MS = VOTE_COOLDOWN_MS + 2 * 60 * 1000; // 12h + 2min grace

  /**
   * Schedule a one-shot DM reminder for a user.
   * Called from the vote webhook and from /vote check.
   */
  export function scheduleVoteReminder(client, userId, streak = 0) {
      console.log(`[VoteReminder] One-shot reminder scheduled for user ${userId} in ${Math.round(REMINDER_DELAY_MS / 60000)} min`);

      setTimeout(async () => {
          try {
              // Double-check they're still opted in
              const [optIn] = await db.select().from(voteReminderOptInTable).where(eq(voteReminderOptInTable.userId, userId));
              if (optIn?.optedIn === false) return;

              // Double-check they haven't already voted again since the timer was set
              const [record] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, userId));
              if (!record) return;
              const sinceLastVote = Date.now() - record.lastVotedAt.getTime();
              if (sinceLastVote < VOTE_COOLDOWN_MS - 60_000) return; // they voted again already

              const botId = client.user.id;
              const voteUrl = `https://top.gg/bot/${botId}/vote`;
              const user = await client.users.fetch(userId).catch(() => null);
              if (!user) return;

              await user.send({
                  embeds: [new EmbedBuilder()
                      .setColor(0x5865f2)
                      .setTitle("🗳️ Time to Vote Again!")
                      .setDescription(
                          `Your 12-hour voting window is open! Vote for Crux to earn:

` +
                          `🪙 **200+ coins** (streak bonus: +${(record.voteStreak ?? 0) * 50} extra)
` +
                          `⭐ **100 XP**
` +
                          `🏆 **16 hours of Premium** for any server you choose

` +
                          `[👉 Vote on Top.gg](${voteUrl})

` +
                          `After voting run \`/vote check\` to claim. Run \`/vote remind\` to turn off these DMs.`
                      )
                      .addFields({ name: "Current Streak", value: `🔥 ${record.voteStreak ?? 0}`, inline: true })
                      .setFooter({ text: "Turn off reminders with /vote remind" })
                      .setTimestamp()],
              });

              console.log(`[VoteReminder] One-shot reminder sent to ${user.tag}`);
          } catch (err) {
              console.warn(`[VoteReminder] Failed to send reminder to ${userId}:`, err.message);
          }
      }, REMINDER_DELAY_MS);
  }

  /**
   * Legacy — startVoteReminderPoller no longer polls.
   * Kept for backward compatibility with ready.js import.
   * Does nothing — reminders are scheduled per-vote now.
   */
  export function startVoteReminderPoller(_client) {
      console.log("[VoteReminder] Polling disabled — reminders are scheduled one-shot per vote.");
  }
  