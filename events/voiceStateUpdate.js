import { Events, EmbedBuilder } from "discord.js";
import { db, serverCustomizationTable, j2cHubsTable, j2cTempChannelsTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { ChannelType } from "discord.js";

export const name = Events.VoiceStateUpdate;
export const once = false;

export async function execute(oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    // ── Join-to-Create (J2C) ──────────────────────────────────────────────────
    // Joining a hub channel → create a temp VC for the user
    if (newState.channelId && newState.channelId !== oldState.channelId) {
        try {
            const [hub] = await db.select().from(j2cHubsTable)
                .where(and(eq(j2cHubsTable.guildId, guild.id), eq(j2cHubsTable.channelId, newState.channelId)));
            if (hub) {
                const channelName = (hub.nameTemplate ?? "{user}'s Channel")
                    .replace(/\{user\}/gi, newState.member.displayName);
                const tempChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: hub.categoryId ?? newState.channel?.parentId ?? null,
                    userLimit: hub.userLimit,
                    bitrate: (hub.bitrate ?? 64) * 1000,
                    permissionOverwrites: [
                        { id: newState.member.id, allow: ["ManageChannels", "MoveMembers"] },
                    ],
                });
                await newState.setChannel(tempChannel);
                await db.insert(j2cTempChannelsTable).values({
                    channelId: tempChannel.id,
                    guildId: guild.id,
                    hubId: String(hub.id),
                    ownerId: newState.member.id,
                }).onConflictDoNothing();
            }
        } catch {}
    }

    // Leaving a temp VC → delete if empty
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        try {
            const [temp] = await db.select().from(j2cTempChannelsTable)
                .where(eq(j2cTempChannelsTable.channelId, oldState.channelId));
            if (temp) {
                const tempChannel = guild.channels.cache.get(oldState.channelId);
                if (tempChannel && tempChannel.members.size === 0) {
                    await tempChannel.delete("J2C: empty temp channel").catch(() => {});
                    await db.delete(j2cTempChannelsTable).where(eq(j2cTempChannelsTable.channelId, oldState.channelId));
                }
            }
        } catch {}
    }

    // ── VC Logging ─────────────────────────────────────────────────────────────
    try {
        const [customization] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guild.id));
        if (!customization?.logChannelId) return;
        const logChannel = guild.channels.cache.get(customization.logChannelId);
        if (!logChannel?.isTextBased()) return;

        const member = newState.member ?? oldState.member;
        if (!member) return;

        // User joined a VC
        if (!oldState.channelId && newState.channelId) {
            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("🔊 Member Joined Voice")
                .addFields(
                    { name: "Member", value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                    { name: "Channel", value: `<#${newState.channelId}>`, inline: true },
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });
            return;
        }

        // User left a VC
        if (oldState.channelId && !newState.channelId) {
            const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("🔇 Member Left Voice")
                .addFields(
                    { name: "Member", value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                    { name: "Channel", value: `<#${oldState.channelId}>`, inline: true },
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });
            return;
        }

        // User moved between VCs
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const embed = new EmbedBuilder()
                .setColor(0xfee75c)
                .setTitle("🔀 Member Moved Voice")
                .addFields(
                    { name: "Member", value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                    { name: "From", value: `<#${oldState.channelId}>`, inline: true },
                    { name: "To", value: `<#${newState.channelId}>`, inline: true },
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });
        }
    } catch {}
}

  // ── J2C orphan cleanup (called on bot ready) ─────────────────────────────────
  // Deletes any temp channels that exist in the DB but were never cleaned up
  // (e.g. bot was offline when the last user left).
  export async function cleanupOrphanedJ2CChannels(client) {
      try {
          const rows = await db.select().from(j2cTempChannelsTable);
          if (rows.length === 0) return;
          let cleaned = 0;
          for (const row of rows) {
              const guild = client.guilds.cache.get(row.guildId)
                  ?? await client.guilds.fetch(row.guildId).catch(() => null);
              if (!guild) {
                  await db.delete(j2cTempChannelsTable).where(eq(j2cTempChannelsTable.channelId, row.channelId));
                  cleaned++;
                  continue;
              }
              const channel = guild.channels.cache.get(row.channelId)
                  ?? await guild.channels.fetch(row.channelId).catch(() => null);
              if (!channel || channel.members.size === 0) {
                  if (channel) await channel.delete("J2C: orphan cleanup").catch(() => {});
                  await db.delete(j2cTempChannelsTable).where(eq(j2cTempChannelsTable.channelId, row.channelId));
                  cleaned++;
              }
          }
          if (cleaned > 0) console.log(`[J2C] Cleaned up ${cleaned} orphaned temp channel(s)`);
      } catch (err) {
          console.error("[J2C] Orphan cleanup error:", err);
      }
  }
  