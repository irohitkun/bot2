import { Events, ActivityType, EmbedBuilder } from "discord.js";
import { registerSlashCommands } from "../utils/registerCommands.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { eq, and, lte, isNotNull } from "drizzle-orm";
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
}

function startExpirationReminders(client) {
    checkExpirations(client);
    setInterval(() => checkExpirations(client), 60 * 60 * 1000);
}

// Resolve who to DM: notifyUserId if set, otherwise guild owner
async function resolveNotifyTargets(client, row) {
    const targets = new Set();

    // Explicit notify UID takes priority
    if (row.notifyUserId) targets.add(row.notifyUserId);

    // Always also try the guild owner
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

        // Expiring within 3 days, not yet reminded
        const expiringSoon = await db.select().from(premiumGuildsTable).where(
            and(
                isNotNull(premiumGuildsTable.expiresAt),
                lte(premiumGuildsTable.expiresAt, in3Days),
                eq(premiumGuildsTable.reminderSent, false),
            )
        );

        for (const row of expiringSoon) {
            if (row.expiresAt.getTime() <= now.getTime()) continue; // already expired
            await sendExpirationReminder(client, row);
            await db.update(premiumGuildsTable)
                .set({ reminderSent: true })
                .where(eq(premiumGuildsTable.guildId, row.guildId));
            invalidatePremiumCache(row.guildId);
        }

        // Already expired — send expired notice and clean up
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
