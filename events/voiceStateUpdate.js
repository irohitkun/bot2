import { Events, PermissionFlagsBits, ChannelType } from "discord.js";
import { db, j2cHubsTable, j2cTempChannelsTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { isPremium } from "../utils/permissions.js";

export const name = Events.VoiceStateUpdate;
export const once = false;

export async function execute(oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    // Handle joining a channel
    if (newState.channelId && newState.channelId !== oldState.channelId) {
        await handleJoin(newState, guild).catch((e) =>
            console.warn("[J2C] handleJoin error:", e.message)
        );
    }

    // Handle leaving a channel
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        await handleLeave(oldState, guild).catch((e) =>
            console.warn("[J2C] handleLeave error:", e.message)
        );
    }
}

async function handleJoin(state, guild) {
    const [hub] = await db.select().from(j2cHubsTable)
        .where(and(eq(j2cHubsTable.guildId, guild.id), eq(j2cHubsTable.channelId, state.channelId)));
    if (!hub) return;

    if (!await isPremium(guild.id)) return;

    const member = state.member;
    if (!member) return;

    // Build channel name from template
    const game = member.presence?.activities?.find((a) => a.type === 0)?.name;
    const channelName = hub.nameTemplate
        .replace(/\{user\}/gi, member.displayName)
        .replace(/\{game\}/gi, game ?? member.displayName)
        .slice(0, 100);

    // Determine parent category: use same category as hub if no override
    const hubChannel = guild.channels.cache.get(hub.channelId);
    const parentId = hub.categoryId ?? hubChannel?.parentId ?? null;

    const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: parentId,
        userLimit: hub.userLimit,
        bitrate: hub.bitrate * 1000,
        permissionOverwrites: [
            // Owner gets manage + move permissions in their own channel
            {
                id: member.id,
                allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.PrioritySpeaker],
            },
        ],
        reason: `J2C: created by ${member.user.tag}`,
    });

    await db.insert(j2cTempChannelsTable).values({
        channelId: newChannel.id,
        guildId: guild.id,
        hubId: hub.channelId,
        ownerId: member.id,
    });

    // Move user into their new channel
    await member.voice.setChannel(newChannel, "J2C: moved to created channel").catch(() => {
        // If move fails, clean up
        newChannel.delete("J2C: move failed, cleanup").catch(() => {});
        db.delete(j2cTempChannelsTable).where(eq(j2cTempChannelsTable.channelId, newChannel.id)).catch(() => {});
    });
}

async function handleLeave(state, guild) {
    const [temp] = await db.select().from(j2cTempChannelsTable)
        .where(and(eq(j2cTempChannelsTable.channelId, state.channelId), eq(j2cTempChannelsTable.guildId, guild.id)));
    if (!temp) return;

    const channel = guild.channels.cache.get(state.channelId);

    // If channel is gone or empty → clean up
    if (!channel || channel.members.size === 0) {
        if (channel) await channel.delete("J2C: channel empty").catch(() => {});
        await db.delete(j2cTempChannelsTable).where(eq(j2cTempChannelsTable.channelId, state.channelId));
    }
}

/**
 * Called from ready.js on startup to clean up orphaned temp channels
 * (channels in DB that no longer exist in Discord, or are empty).
 */
export async function cleanupOrphanedJ2CChannels(client) {
    try {
        const all = await db.select().from(j2cTempChannelsTable);
        for (const row of all) {
            const guild = client.guilds.cache.get(row.guildId);
            if (!guild) continue;
            const channel = guild.channels.cache.get(row.channelId);
            if (!channel || channel.members.size === 0) {
                if (channel) await channel.delete("J2C: orphan cleanup").catch(() => {});
                await db.delete(j2cTempChannelsTable).where(eq(j2cTempChannelsTable.channelId, row.channelId));
            }
        }
    } catch (err) {
        console.warn("[J2C] Cleanup error:", err.message);
    }
}
