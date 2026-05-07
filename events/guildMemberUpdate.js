import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.GuildMemberUpdate;
  export const once = false;
  export async function execute(oldMember, newMember) {
      const guild = newMember.guild;
      const wasTimedOut = !!oldMember.communicationDisabledUntil && oldMember.communicationDisabledUntil > new Date();
      const isTimedOut  = !!newMember.communicationDisabledUntil && newMember.communicationDisabledUntil > new Date();
      if (!wasTimedOut && isTimedOut) {
          let executorId = null;
          try {
              const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
              const entry = logs.entries.first();
              if (entry && entry.target?.id === newMember.id && (Date.now() - entry.createdTimestamp) < 5000) executorId = entry.executor?.id;
          } catch {}
          return sendModLog(guild, new EmbedBuilder().setColor(0xf47b67).setTitle("🔇 Member Timed Out")
              .addFields(
                  { name: "Member", value: `${newMember.user.tag} (${newMember.id})`, inline: true },
                  { name: "By",     value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
                  { name: "Until",  value: `<t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}:F>`, inline: false },
              ).setThumbnail(newMember.user.displayAvatarURL()).setTimestamp(), "Event Log").catch(() => {});
      }
      if (wasTimedOut && !isTimedOut) {
          return sendModLog(guild, new EmbedBuilder().setColor(0x57f287).setTitle("🔊 Timeout Removed")
              .addFields({ name: "Member", value: `${newMember.user.tag} (${newMember.id})`, inline: true })
              .setThumbnail(newMember.user.displayAvatarURL()).setTimestamp(), "Event Log").catch(() => {});
      }
      if (oldMember.nickname !== newMember.nickname) {
          return sendModLog(guild, new EmbedBuilder().setColor(0x5865f2).setTitle("✏️ Nickname Changed")
              .addFields(
                  { name: "Member", value: `${newMember.user.tag} (${newMember.id})`, inline: false },
                  { name: "Before", value: oldMember.nickname ?? "*None*", inline: true },
                  { name: "After",  value: newMember.nickname ?? "*None*", inline: true },
              ).setThumbnail(newMember.user.displayAvatarURL()).setTimestamp(), "Event Log").catch(() => {});
      }
      const added   = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
      const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
      if (added.size === 0 && removed.size === 0) return;
      const embed = new EmbedBuilder().setColor(0xa855f7).setTitle("🎭 Member Roles Updated")
          .addFields({ name: "Member", value: `${newMember.user.tag} (${newMember.id})`, inline: false });
      if (added.size)   embed.addFields({ name: "Roles Added",   value: added.map((r) => r.toString()).join(", ") });
      if (removed.size) embed.addFields({ name: "Roles Removed", value: removed.map((r) => r.toString()).join(", ") });
      await sendModLog(guild, embed.setThumbnail(newMember.user.displayAvatarURL()).setTimestamp(), "Event Log").catch(() => {});
  }