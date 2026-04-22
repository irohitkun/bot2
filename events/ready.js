import { Events, ActivityType, EmbedBuilder } from "discord.js";
import { registerSlashCommands } from "../utils/registerCommands.js";
import { db, premiumGuildsTable, giveawaysTable, remindersTable } from "../db/index.js";
import { eq, and, lte, isNotNull, lt } from "drizzle-orm";
import { invalidatePremiumCache } from "../utils/permissions.js";

const TIER_ICONS = { free: "🔓", basic: "⭐", pro: "💎", enterprise: "👑" };

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
    console.log(`Logged in as ${client.user?.tag}`);
    client.user?.setActivity("your server 🛡️", { type: ActivityType.Watching });

    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = client.user.id;

    try {
        await registerSlashCommands(token, clientId);
    } catch (err) {
        console.error("Failed to register slash commands:", err);
    }

    startExpirationReminders(client);
    await recoverActiveGiveaways(client);
    startReminderPoller(client);
}

// ── Premium expiration reminders ─────────────────────────────────────────────

function startExpirationReminders(client) {
    checkExpirations(client);
    setInterval(() => checkExpirations(client), 60 * 60 * 1000);
}

async function resolveNotifyTargets(client, row) {
    const targets = new Set();
    if (row.notifyUserId) targets.add(row.notifyUserId);
    try {
        const guild = await client.guilds.fetch(row.guildId);
        if (guild?.ownerId) targets.add(guild.ownerId);
    } catch {
        // Bot may not be in the guild anymore — skip
    }
    return [...targets];
}

async function checkExpirations(client) {
    try {
        const now = new Date();
        const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        const expiringSoon = await db.select().from(premiumGuildsTable).where(
            and(
                isNotNull(premiumGuildsTable.expiresAt),
                lte(premiumGuildsTable.expiresAt, in3Days),
                eq(premiumGuildsTable.reminderSent, false),
            )
        );

        for (const row of expiringSoon) {
            if (row.expiresAt.getTime() <= now.getTime()) continue;
            await sendExpirationReminder(client, row);
            await db.update(premiumGuildsTable)
                .set({ reminderSent: true })
                .where(eq(premiumGuildsTable.guildId, row.guildId));
            invalidatePremiumCache(row.guildId);
        }

        const justExpired = await db.select().from(premiumGuildsTable).where(
            and(
                isNotNull(premiumGuildsTable.expiresAt),
                lte(premiumGuildsTable.expiresAt, now),
                eq(premiumGuildsTable.reminderSent, true),
            )
        );

        for (const row of justExpired) {
            await sendExpiredNotice(client, row);
            await db.delete(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, row.guildId));
            invalidatePremiumCache(row.guildId);
        }
    } catch (err) {
        console.error("[PremiumReminder] Error:", err);
    }
}

async function sendExpirationReminder(client, row) {
    const daysLeft = Math.ceil((row.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("⚠️ Premium Expiring Soon")
        .setDescription(
            `The **${row.isTrial ? "free trial" : "premium"}** for server \`${row.guildId}\` expires in **${daysLeft} day${daysLeft !== 1 ? "s" : ""}**.\n\n` +
            `After it expires, the server reverts to the **Free** tier.\n` +
            (row.isTrial
                ? "Contact the bot owner to upgrade to a paid plan and keep your features!"
                : "Contact the bot owner to renew your subscription.")
        )
        .addFields(
            { name: "Tier", value: `${TIER_ICONS[row.tier] ?? "⭐"} ${row.tier}`, inline: true },
            { name: "Expires", value: `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`, inline: true },
        )
        .setTimestamp();

    const targets = await resolveNotifyTargets(client, row);
    for (const userId of targets) {
        try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [embed] });
            console.log(`[PremiumReminder] Sent expiry warning to ${user.tag} for guild ${row.guildId}`);
        } catch {
            console.warn(`[PremiumReminder] Could not DM ${userId} for guild ${row.guildId}`);
        }
    }
}

async function sendExpiredNotice(client, row) {
    const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🔴 Premium Expired")
        .setDescription(
            `The **${row.isTrial ? "free trial" : "premium"}** for server \`${row.guildId}\` has expired.\n\n` +
            `The server is now on the **Free** tier.\n` +
            (row.isTrial
                ? "Contact the bot owner to upgrade to a paid plan."
                : "Contact the bot owner to renew your subscription.")
        )
        .addFields(
            { name: "Was Tier", value: `${TIER_ICONS[row.tier] ?? "⭐"} ${row.tier}`, inline: true },
            { name: "Expired", value: `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`, inline: true },
        )
        .setTimestamp();

    const targets = await resolveNotifyTargets(client, row);
    for (const userId of targets) {
        try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [embed] });
            console.log(`[PremiumReminder] Sent expired notice to ${user.tag} for guild ${row.guildId}`);
        } catch {
            console.warn(`[PremiumReminder] Could not DM ${userId} for guild ${row.guildId}`);
        }
    }
}

// ── Giveaway recovery (handles bot restarts) ──────────────────────────────────

// Node setTimeout silently truncates delays > 2^31-1 ms (~24.8 days) to 1 ms.
// Chunk long delays so legacy giveaways still fire at the right time.
const MAX_TIMEOUT_MS = 2_147_483_647;
function safeSetTimeout(fn, delay) {
    if (delay > MAX_TIMEOUT_MS) {
        return setTimeout(() => safeSetTimeout(fn, delay - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
    }
    return setTimeout(fn, Math.max(0, delay));
}

async function recoverActiveGiveaways(client) {
    try {
        const active = await db.select().from(giveawaysTable).where(eq(giveawaysTable.ended, false));
        if (active.length === 0) return;

        const now = Date.now();
        console.log(`[Giveaways] Recovering ${active.length} active giveaway(s)...`);

        for (const row of active) {
            const delay = Math.max(0, row.endsAt.getTime() - now);

            if (delay === 0) {
                // Already past due — end immediately
                await endGiveaway(client, row);
            } else {
                safeSetTimeout(() => endGiveaway(client, row), delay);
                console.log(`[Giveaways] Scheduled giveaway ${row.id} to end in ${Math.round(delay / 1000)}s`);
            }
        }
    } catch (err) {
        console.error("[Giveaways] Recovery error:", err);
    }
}

async function endGiveaway(client, row) {
    try {
        // Re-check still active
        const [current] = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, row.id));
        if (!current || current.ended) return;

        const channel = await client.channels.fetch(row.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(row.messageId).catch(() => null) : null;

        let winners = [];
        if (message) {
            const reaction = message.reactions.cache.get("🎉");
            if (reaction) {
                const users = await reaction.users.fetch();
                const eligible = [...users.values()].filter((u) => !u.bot);
                winners = eligible
                    .sort(() => Math.random() - 0.5)
                    .slice(0, Math.min(row.winnersCount, eligible.length))
                    .map((u) => u.id);
            }
        }

        await db.update(giveawaysTable)
            .set({ ended: true, winners: winners.join(",") })
            .where(eq(giveawaysTable.id, row.id));

        if (message) {
            const endEmbed = new EmbedBuilder()
                .setColor(winners.length > 0 ? 0x57f287 : 0xed4245)
                .setTitle("🎉 Giveaway Ended!")
                .setDescription(
                    winners.length > 0
                        ? `**Prize:** ${row.prize}\n**Winner${winners.length > 1 ? "s" : ""}:** ${winners.map((id) => `<@${id}>`).join(", ")}`
                        : `**Prize:** ${row.prize}\n\nNo valid entries!`
                )
                .setTimestamp();
            await message.edit({ embeds: [endEmbed] }).catch(() => {});
            if (winners.length > 0 && channel) {
                await channel
                    .send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${row.prize}**!`)
                    .catch(() => {});
            }
        }

        console.log(`[Giveaways] Ended giveaway ${row.id} (${row.prize})`);
    } catch (err) {
        console.error(`[Giveaways] Error ending giveaway ${row.id}:`, err);
    }
}

// ── Reminder poller ───────────────────────────────────────────────────────────

function startReminderPoller(client) {
    pollReminders(client);
    setInterval(() => pollReminders(client), 60 * 1000);
}

async function pollReminders(client) {
    try {
        const now = new Date();
        const due = await db
            .select()
            .from(remindersTable)
            .where(and(eq(remindersTable.sent, false), lte(remindersTable.remindAt, now)));

        for (const reminder of due) {
            try {
                const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
                if (channel) {
                    await channel
                        .send(`⏰ <@${reminder.userId}> — Reminder: **${reminder.message}**`)
                        .catch(() => {});
                } else {
                    // Fallback: try to DM the user
                    const user = await client.users.fetch(reminder.userId).catch(() => null);
                    if (user) {
                        await user
                            .send(`⏰ Reminder: **${reminder.message}**`)
                            .catch(() => {});
                    }
                }
            } catch (err) {
                console.warn(`[Reminders] Could not deliver reminder ${reminder.id}:`, err.message);
            }

            await db
                .update(remindersTable)
                .set({ sent: true })
                .where(eq(remindersTable.id, reminder.id));
        }
    } catch (err) {
        console.error("[Reminders] Poll error:", err);
    }
}
