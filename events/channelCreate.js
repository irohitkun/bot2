import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.ChannelCreate;
  export const once = false;
  export async function execute(channel) {
      if (!channel.guild) return;
      let executorId = null;
      try {
          const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
          const entry = logs.entries.first();
          if (entry && (Date.now() - entry.createdTimestamp) < 5000) executorId = entry.executor?.id;
      } catch {}
      await sendModLog(channel.guild, new EmbedBuilder().setColor(0x57f287).setTitle("✅ Channel Created")
          .addFields(
              { name: "Channel",    value: channel.toString(), inline: true },
              { name: "Type",       value: channel.type?.toString() ?? "Unknown", inline: true },
              { name: "Category",   value: channel.parent?.name ?? "None", inline: true },
              { name: "Created By", value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
          ).setTimestamp(), "Event Log");
  }