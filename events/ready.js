import { Events, ActivityType, EmbedBuilder } from "discord.js";
import { registerSlashCommands } from "../utils/registerCommands.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { invalidatePremiumCache } from "../utils/permissions.js";

const TIER_ICONS  = { free: "🔓", basic: "⭐", pro: "💎", enterprise: "👑" };

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

    // Start the premium expiration reminder loop (runs every hour)
    startExpirationReminders(client);
}

function startExpirationReminders(client) {
    // Run immediately on startup, then every hour
    checkExpirations(client);
    setInterval(() => checkExpirations(client), 60 * 60 * 1000);
}

async function checkExpirations(client) {
    try {
        const now = new Date();
        const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        // Find premium guilds expiring within 3 days that haven't been reminded yet
        const expiringSoon = await db.select().from(premiumGuildsTable)
            .where(
                and(
                    isNotNull(premiumGuildsTable.expiresAt),
                    lte(premiumGuildsTable.expiresAt, in3Days),
                    eq(premiumGuildsTable.reminderSent, false),
                )
            );

        for (const row of expiringSoon) {
            const expired = row.expiresAt && row.expiresAt.getTime() <= now.getTime();
            if (expired) continue; // already expired, skip

            await sendExpirationReminder(client, row);

            // Mark reminder as sent
            await db.update(premiumGuildsTable)
                .set({ reminderSent: true })
                .where(eq(premiumGuildsTable.guildId, row.guildId));

            invalidatePremiumCache(row.guildId);
        }

        // Also check for newly expired guilds and notify
        const justExpired = await db.select().from(premiumGuildsTable)
            .where(
                and(
                    isNotNull(premiumGuildsTable.expiresAt),
                    lte(premiumGuildsTable.expiresAt, now),
                    eq(premiumGuildsTable.reminderSent, true),
                )
            );

        for (const row of justExpired) {
            await sendExpiredNotice(client, row);
            // Remove from DB so the guild drops back to free
            await db.delete(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, row.guildId));
            invalidatePremiumCache(row.guildId);
        }

    } catch (err) {
        console.error("[PremiumReminder] Error checking expirations:", err);
    }
}

async function sendExpirationReminder(client, row) {
    const daysLeft = Math.ceil((row.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("⚠️ Premium Expiring Soon")
        .setDescription(
            `Your **${row.isTrial ? "free trial" : "premium"}** for server \`${row.guildId}\` is expiring in **${daysLeft} day${daysLeft !== 1 ? "s" : ""}**.\n\n` +
            `After it expires, the server will revert to the **Free** tier.\n` +
            (row.isTrial ? `Contact the bot owner to upgrade to a paid plan and keep your features!` : `Contact the bot owner to renew your subscription.`)
        )
        .addFields(
            { name: "Tier", value: `${TIER_ICONS[row.tier] ?? "⭐"} ${row.tier}`, inline: true },
            { name: "Expires", value: `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`, inline: true },
        )
        .setTimestamp();

    const targetUserIds = [...new Set([row.activatedBy])];

    // Also try to get the guild owner
    try {
        const guild = await client.guilds.fetch(row.guildId);
        if (guild && guild.ownerId && guild.ownerId !== row.activatedBy) {
            targetUserIds.push(guild.ownerId);
        }
    } catch {
        // Guild may not be cached or bot left — skip
    }

    for (const userId of targetUserIds) {
        try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [embed] });
            console.log(`[PremiumReminder] Sent expiration warning to ${user.tag} for guild ${row.guildId}`);
        } catch {
            console.warn(`[PremiumReminder] Could not DM user ${userId} for guild ${row.guildId}`);
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
                ? `Contact the bot owner to upgrade to a paid plan.`
                : `Contact the bot owner to renew your subscription.`)
        )
        .addFields(
            { name: "Was Tier", value: `${TIER_ICONS[row.tier] ?? "⭐"} ${row.tier}`, inline: true },
            { name: "Expired", value: `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`, inline: true },
        )
        .setTimestamp();

    const targetUserIds = [...new Set([row.activatedBy])];

    try {
        const guild = await client.guilds.fetch(row.guildId);
        if (guild && guild.ownerId && guild.ownerId !== row.activatedBy) {
            targetUserIds.push(guild.ownerId);
        }
    } catch {}

    for (const userId of targetUserIds) {
        try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [embed] });
            console.log(`[PremiumReminder] Sent expired notice to ${user.tag} for guild ${row.guildId}`);
        } catch {
            console.warn(`[PremiumReminder] Could not DM user ${userId} for guild ${row.guildId}`);
        }
    }
}
