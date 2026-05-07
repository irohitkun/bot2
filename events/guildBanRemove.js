import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.GuildBanRemove;
  export const once = false;
  export async function execute(ban) {
      const guild = ban.guild;
      let executorId = null;
      try {
          const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
          const entry = logs.entries.first();
          if (entry && entry.target?.id === ban.user.id && (Date.now() - entry.createdTimestamp) < 5000)
              executorId = entry.executor?.id;
      } catch {}
      await sendModLog(guild, new EmbedBuilder()
          .setColor(0x57f287).setTitle("✅ Member Unbanned")
          .addFields(
              { name: "User",        value: `${ban.user.tag} (${ban.user.id})`, inline: true },
              { name: "Unbanned By", value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
          ).setThumbnail(ban.user.displayAvatarURL()).setTimestamp(), "Event Log");
  }