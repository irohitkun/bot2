/**
 * AntiNuke tracker — detects mass destructive actions (bans, kicks, channel/role deletes)
 * within a rolling time window and takes action (ban/kick/strip roles) against the offender.
 *
 * Each guild maintains a Map of userId → [timestamps of actions].
 * When the count within timeWindow exceeds threshold, the bot fires the configured action.
 */
import { AuditLogEvent, EmbedBuilder } from "discord.js";
import { db, antinukeSettingsTable, antinukeWhitelistTable } from "../db/index.js";
import { eq } from "drizzle-orm";

// { guildId → { userId → { bans: [], kicks: [], channelDeletes: [], roleDeletes: [] } } }
const actionTracker = new Map();

function getTracker(guildId, userId) {
    if (!actionTracker.has(guildId)) actionTracker.set(guildId, new Map());
    const guild = actionTracker.get(guildId);
    if (!guild.has(userId)) guild.set(userId, { bans: [], kicks: [], channelDeletes: [], roleDeletes: [] });
    return guild.get(userId);
}

function prune(tracker, key, windowMs) {
    const cutoff = Date.now() - windowMs;
    tracker[key] = tracker[key].filter((t) => t > cutoff);
}

async function getSettings(guildId) {
    const [s] = await db.select().from(antinukeSettingsTable).where(eq(antinukeSettingsTable.guildId, guildId));
    return s;
}

async function isWhitelisted(guildId, userId) {
    const [row] = await db.select().from(antinukeWhitelistTable)
        .where(eq(antinukeWhitelistTable.guildId, guildId))
        .where(eq(antinukeWhitelistTable.userId, userId));
    return !!row;
}

async function takeAction(guild, member, settings, reason) {
    try {
        const action = settings.action ?? "ban";
        if (action === "ban") {
            await guild.members.ban(member.id, { reason: `[AntiNuke] ${reason}` });
        } else if (action === "kick") {
            await member.kick(`[AntiNuke] ${reason}`);
        } else if (action === "strip") {
            const manageableRoles = member.roles.cache.filter(
                (r) => r.id !== guild.id && r.position < guild.members.me.roles.highest.position
            );
            for (const role of manageableRoles.values()) {
                await member.roles.remove(role).catch(() => {});
            }
        }
    } catch (err) {
        console.warn("[AntiNuke] Failed to take action:", err.message);
    }

    if (settings.logChannelId) {
        try {
            const logCh = guild.channels.cache.get(settings.logChannelId);
            if (logCh?.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle("🛡️ AntiNuke — Action Taken")
                    .setDescription(`**Reason:** ${reason}`)
                    .addFields(
                        { name: "User", value: `<@${member.id}> (${member.user?.tag ?? member.id})`, inline: true },
                        { name: "Action", value: settings.action ?? "ban", inline: true },
                    )
                    .setTimestamp();
                await logCh.send({ embeds: [embed] });
            }
        } catch {}
    }
}

/**
 * Track a ban action. Call from guildBanAdd handler after fetching audit log.
 */
export async function trackBan(guild, executorId) {
    const settings = await getSettings(guild.id);
    if (!settings?.enabled) return;
    if (guild.ownerId === executorId) return;
    if (await isWhitelisted(guild.id, executorId)) return;

    const tracker = getTracker(guild.id, executorId);
    const windowMs = (settings.timeWindow ?? 10) * 1000;
    prune(tracker, "bans", windowMs);
    tracker.bans.push(Date.now());

    if (tracker.bans.length >= (settings.banThreshold ?? 3)) {
        tracker.bans = []; // reset to avoid repeated triggering
        const member = await guild.members.fetch(executorId).catch(() => null);
        if (member) await takeAction(guild, member, settings, `Mass ban detected (${tracker.bans.length + settings.banThreshold} bans in ${settings.timeWindow}s)`);
    }
}

/**
 * Track a kick action. Call from guildMemberRemove handler after checking audit log.
 */
export async function trackKick(guild, executorId) {
    const settings = await getSettings(guild.id);
    if (!settings?.enabled) return;
    if (guild.ownerId === executorId) return;
    if (await isWhitelisted(guild.id, executorId)) return;

    const tracker = getTracker(guild.id, executorId);
    const windowMs = (settings.timeWindow ?? 10) * 1000;
    prune(tracker, "kicks", windowMs);
    tracker.kicks.push(Date.now());

    if (tracker.kicks.length >= (settings.kickThreshold ?? 3)) {
        tracker.kicks = [];
        const member = await guild.members.fetch(executorId).catch(() => null);
        if (member) await takeAction(guild, member, settings, `Mass kick detected`);
    }
}

/**
 * Track a channel delete. Call from channelDelete handler.
 */
export async function trackChannelDelete(guild, executorId) {
    const settings = await getSettings(guild.id);
    if (!settings?.enabled) return;
    if (guild.ownerId === executorId) return;
    if (await isWhitelisted(guild.id, executorId)) return;

    const tracker = getTracker(guild.id, executorId);
    const windowMs = (settings.timeWindow ?? 10) * 1000;
    prune(tracker, "channelDeletes", windowMs);
    tracker.channelDeletes.push(Date.now());

    if (tracker.channelDeletes.length >= (settings.channelThreshold ?? 3)) {
        tracker.channelDeletes = [];
        const member = await guild.members.fetch(executorId).catch(() => null);
        if (member) await takeAction(guild, member, settings, `Mass channel delete detected`);
    }
}

/**
 * Track a role delete. Call from roleDelete handler.
 */
export async function trackRoleDelete(guild, executorId) {
    const settings = await getSettings(guild.id);
    if (!settings?.enabled) return;
    if (guild.ownerId === executorId) return;
    if (await isWhitelisted(guild.id, executorId)) return;

    const tracker = getTracker(guild.id, executorId);
    const windowMs = (settings.timeWindow ?? 10) * 1000;
    prune(tracker, "roleDeletes", windowMs);
    tracker.roleDeletes.push(Date.now());

    if (tracker.roleDeletes.length >= (settings.roleThreshold ?? 3)) {
        tracker.roleDeletes = [];
        const member = await guild.members.fetch(executorId).catch(() => null);
        if (member) await takeAction(guild, member, settings, `Mass role delete detected`);
    }
}
