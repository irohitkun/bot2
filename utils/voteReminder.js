/**
 * Vote Reminder System
 * --------------------
 * DMed to opted-in users when their 12-hour vote cooldown expires.
 * Called from events/ready.js to start the poller.
 */

import { EmbedBuilder } from "discord.js";
import { db, voteRecordsTable, voteReminderOptInTable } from "../db/index.js";
import { eq, and, lte } from "drizzle-orm";

const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const REMINDER_FUZZ_MS = 2 * 60 * 1000; // send 2 min after window opens to avoid race
const remindedThisCycle = new Set(); // userId:lastVotedAt.getTime()

export function startVoteReminderPoller(client) {
    pollVoteReminders(client);
    setInterval(() => pollVoteReminders(client), 5 * 60 * 1000); // check every 5 min
}

async function pollVoteReminders(client) {
    try {
        const cutoff = new Date(Date.now() - VOTE_COOLDOWN_MS - REMINDER_FUZZ_MS);
        const eligible = await db.select({
            userId: voteReminderOptInTable.userId,
            lastVotedAt: voteRecordsTable.lastVotedAt,
            voteStreak: voteRecordsTable.voteStreak,
        })
            .from(voteReminderOptInTable)
            .leftJoin(voteRecordsTable, eq(voteReminderOptInTable.userId, voteRecordsTable.userId))
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
            const key = `${row.userId}:${row.lastVotedAt.getTime()}`;
            if (remindedThisCycle.has(key)) continue;
            remindedThisCycle.add(key);

            try {
                const user = await client.users.fetch(row.userId).catch(() => null);
                if (!user) continue;

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("🗳️ Time to Vote Again!")
                    .setDescription(
                        `Your 12-hour voting window is open! Vote for Crux on Top.gg to earn:\n\n` +
                        `🪙 **200+ coins** (streak bonus: +${(row.voteStreak ?? 0) * 50} extra)\n` +
                        `⭐ **100 XP**\n` +
                        `🏆 **16 hours of Premium** for any server you choose\n\n` +
                        `[👉 Vote on Top.gg](${voteUrl})\n\n` +
                        `After voting run \`/vote check\` to claim. Run \`/vote remind\` to turn off these DMs.`
                    )
                    .addFields({ name: "Current Streak", value: `🔥 ${row.voteStreak ?? 0} days`, inline: true })
                    .setFooter({ text: "Turn off reminders with /vote remind" })
                    .setTimestamp();

                await user.send({ embeds: [embed] }).catch(() => {
                    remindedThisCycle.delete(key);
                });
            } catch {}
        }

        // Clean up old cycle keys older than 24h
        const now = Date.now();
        for (const key of remindedThisCycle) {
            const ts = parseInt(key.split(":")[1] ?? "0", 10);
            if (now - ts > 24 * 60 * 60 * 1000) remindedThisCycle.delete(key);
        }
    } catch (err) {
        console.error("[VoteReminder] Poll error:", err);
    }
}
