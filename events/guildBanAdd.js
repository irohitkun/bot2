import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
  import { trackBan } from "../utils/antinuke.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.GuildBanAdd;
  export const once = false;
  export async function execute(ban) {
      const guild = ban.guild;
      let executorId = null;
      try {
          const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBan, limit: 1 });
          const entry = logs.entries.first();
          if (entry && entry.target?.id === ban.user.id && (Date.now() - entry.createdTimestamp) < 5000) executorId = entry.executor?.id;
      } catch {}
      if (executorId && executorId !== guild.client.user.id) await trackBan(guild, executorId).catch(() => {});
      await sendModLog(guild, new EmbedBuilder().setColor(0xed4245).setTitle("🔨 Member Banned")
          .addFields(
              { name: "User",      value: `${ban.user.tag} (${ban.user.id})`, inline: true },
              { name: "Banned By", value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
              { name: "Reason",    value: ban.reason ?? "No reason provided", inline: false },
          ).setThumbnail(ban.user.displayAvatarURL()).setTimestamp(), "Event Log");
  }