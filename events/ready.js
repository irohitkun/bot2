import { Events, ActivityType, EmbedBuilder } from "discord.js";
import { registerSlashCommands } from "../utils/registerCommands.js";
import { syncTopggCommands } from "../utils/topggSync.js";
import { db, premiumGuildsTable, giveawaysTable, remindersTable, scheduledMessagesTable, birthdaysTable, birthdaySettingsTable, j2cTempChannelsTable } from "../db/index.js";
import { eq, and, lte, isNotNull, lt } from "drizzle-orm";
import { cleanupOrphanedJ2CChannels } from "./voiceStateUpdate.js";
import { invalidatePremiumCache, normalizeTier } from "../utils/permissions.js";
import { scheduleGiveawayEnd } from "../utils/giveawayScheduler.js";
import { recoverTempBans } from "../utils/tempBanScheduler.js";
import { recoverTempRoles } from "../utils/tempRoleScheduler.js";
import { recoverSlowmodeTimers } from "../utils/slowmodeScheduler.js";
import { startVoteReminderPoller } from "../utils/voteReminder.js";
import { loadEmojiServer } from "../utils/emojis.js";

const TIER_ICONS = { free: "🔓", premium: "⭐" };

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
    console.log(`Logged in as ${client.user?.tag}`);
    client.user?.setPresence({
        status: "dnd",
        activities: [{ name: "your server 🛡️", type: ActivityType.Watching }],
    });

    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = client.user.id;

    try {
        await registerSlashCommands(token, clientId);
    } catch (err) {
        console.error("Failed to register slash commands:", err);
    }

    // Sync command list to Top.gg "Commands" tab (requires TOPGG_TOKEN env var)
    syncTopggCommands(clientId).catch(e => console.warn("[TopGG Sync] Error:", e.message));

    // Load custom/animated emojis from the designated emoji server
    await loadEmojiServer();

    startExpirationReminders(client);
    await recoverActiveGiveaways(client);
    await recoverTempBans(client);
    await recoverTempRoles(client);
    await recoverSlowmodeTimers(client);
    startReminderPoller(client);
    startScheduledMessagePoller(client);
    await cleanupOrphanedJ2CChannels(client);
    startBirthdayPoller(client);
    startVoteReminderPoller(client);
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

/**
 * Returns activation-method-specific renewal instructions.
 * @param {"vote"|"trial"|"admin"|string} method
 * @param {boolean} isReminder - true = expiring soon, false = already expired
 */
function getRenewalInstructions(method, isReminder) {
    const action = isReminder ? "before it expires" : "to reactivate";
    switch (method) {
        case "vote":
            return (
                `🗳️ **Vote ${action}:** Vote for Crux on [Top.gg](https://top.gg/bot/1482403011144843366/vote) ` +
                `and run \`/vote check\` — each vote unlocks **16 hours of Premium** for the server of your choice.\n` +
                `You can vote every 12 hours to keep it active continuously.`
            );
        case "trial":
            return (
                `🎁 **Your free trial is ending.** Trials are one-time only and can't be restarted.\n` +
                `🗳️ Vote for Crux on [Top.gg](https://top.gg/bot/1482403011144843366/vote) and run \`/vote check\` ` +
                `to unlock **16 hours of Premium** per vote — completely free!\n` +
                `Contact the bot owner if you'd like to discuss a paid upgrade.`
            );
        case "admin":
        default:
            return (
                `📩 **Contact the bot owner** ${action} — your premium was manually granted.\n` +
                `Alternatively, vote for Crux on [Top.gg](https://top.gg/bot/1482403011144843366/vote) ` +
                `and run \`/vote check\` to earn free **16 hours of Premium** per vote.`
            );
    }
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
    const method = row.activationMethod ?? (row.isTrial ? "trial" : "admin");
    const tierLabel = row.isTrial ? "Free Trial" : "Premium";
    const renewal = getRenewalInstructions(method, true);

    const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle(`⚠️ ${tierLabel} Expiring Soon`)
        .setDescription(
            `The **${tierLabel}** for server \`${row.guildId}\` expires in **${daysLeft} day${daysLeft !== 1 ? "s" : ""}**.\n\n` +
            `After it expires, the server reverts to the **Free** tier.\n\n${renewal}`
        )
        .addFields(
            { name: "Tier", value: `${TIER_ICONS[normalizeTier(row.tier)] ?? "⭐"} ${normalizeTier(row.tier)}`, inline: true },
            { name: "Expires", value: `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Activated Via", value: method === "vote" ? "🗳️ Vote" : method === "trial" ? "🎁 Free Trial" : "⭐ Admin Grant", inline: true },
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
    const method = row.activationMethod ?? (row.isTrial ? "trial" : "admin");
    const tierLabel = row.isTrial ? "Free Trial" : "Premium";
    const renewal = getRenewalInstructions(method, false);

    const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`🔴 ${tierLabel} Expired`)
        .setDescription(
            `The **${tierLabel}** for server \`${row.guildId}\` has expired.\n\n` +
            `The server is now on the **Free** tier.\n\n${renewal}`
        )
        .addFields(
            { name: "Was Tier", value: `${TIER_ICONS[normalizeTier(row.tier)] ?? "⭐"} ${normalizeTier(row.tier)}`, inline: true },
            { name: "Expired", value: `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Activated Via", value: method === "vote" ? "🗳️ Vote" : method === "trial" ? "🎁 Free Trial" : "⭐ Admin Grant", inline: true },
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

async function recoverActiveGiveaways(client) {
    try {
        const active = await db.select().from(giveawaysTable).where(eq(giveawaysTable.ended, false));
        if (active.length === 0) return;

        console.log(`[Giveaways] Recovering ${active.length} active giveaway(s)...`);

        for (const row of active) {
            scheduleGiveawayEnd(client, row);
            const delay = Math.max(0, row.endsAt.getTime() - Date.now());
            console.log(`[Giveaways] Scheduled giveaway ${row.id} to end in ${Math.round(delay / 1000)}s`);
        }
    } catch (err) {
        console.error("[Giveaways] Recovery error:", err);
    }
}

// ── Scheduled message poller ──────────────────────────────────────────────────

function startScheduledMessagePoller(client) {
    pollScheduledMessages(client);
    setInterval(() => pollScheduledMessages(client), 60 * 1000);
}

async function pollScheduledMessages(client) {
    try {
        const now = new Date();
        const due = await db
            .select()
            .from(scheduledMessagesTable)
            .where(and(eq(scheduledMessagesTable.sent, false), lte(scheduledMessagesTable.sendAt, now)));

        for (const msg of due) {
            try {
                const channel = await client.channels.fetch(msg.channelId).catch(() => null);
                if (channel?.isTextBased()) {
                    await channel.send(msg.content).catch(() => {});
                }
            } catch (err) {
                console.warn(`[ScheduledMsg] Could not send message #${msg.id}:`, err.message);
            }
            await db.update(scheduledMessagesTable).set({ sent: true }).where(eq(scheduledMessagesTable.id, msg.id));
        }
    } catch (err) {
        console.error("[ScheduledMsg] Poll error:", err);
    }
}

// ── Birthday poller ───────────────────────────────────────────────────────────

const birthdayAnnouncedToday = new Set();

function startBirthdayPoller(client) {
    pollBirthdays(client);
    setInterval(() => pollBirthdays(client), 60 * 60 * 1000);
}

async function pollBirthdays(client) {
    try {
        const now = new Date();
        const month = now.getUTCMonth() + 1;
        const day = now.getUTCDate();

        const todays = await db.select().from(birthdaysTable)
            .where(and(eq(birthdaysTable.month, month), eq(birthdaysTable.day, day)));

        for (const bday of todays) {
            const key = `${bday.guildId}:${bday.userId}:${month}:${day}`;
            if (birthdayAnnouncedToday.has(key)) continue;

            const [settings] = await db.select().from(birthdaySettingsTable)
                .where(and(eq(birthdaySettingsTable.guildId, bday.guildId), eq(birthdaySettingsTable.enabled, true)));
            if (!settings?.channelId) continue;

            const guild = client.guilds.cache.get(bday.guildId);
            if (!guild) continue;

            const member = await guild.members.fetch(bday.userId).catch(() => null);
            if (!member) continue;

            const channel = guild.channels.cache.get(settings.channelId)
                ?? await guild.channels.fetch(settings.channelId).catch(() => null);
            if (!channel?.isTextBased()) continue;

            const content = settings.message.replace(/\{user\}/gi, member.toString());
            await channel.send({ content }).catch(() => {});

            if (settings.roleId) {
                await member.roles.add(settings.roleId, "Birthday role").catch(() => {});
                setTimeout(async () => {
                    await member.roles.remove(settings.roleId, "Birthday role expired").catch(() => {});
                }, 24 * 60 * 60 * 1000);
            }

            birthdayAnnouncedToday.add(key);
        }
    } catch (err) {
        console.error("[Birthdays] Poll error:", err);
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
