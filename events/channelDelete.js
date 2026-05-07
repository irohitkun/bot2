import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
  import { trackChannelDelete } from "../utils/antinuke.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.ChannelDelete;
  export const once = false;
  export async function execute(channel) {
      if (!channel.guild) return;
      let executorId = null;
      try {
          const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
          const entry = logs.entries.first();
          if (entry && (Date.now() - entry.createdTimestamp) < 5000) {
              executorId = entry.executor?.id;
              if (executorId) await trackChannelDelete(channel.guild, executorId);
          }
      } catch {}
      await sendModLog(channel.guild, new EmbedBuilder().setColor(0xed4245).setTitle("🗑️ Channel Deleted")
          .addFields(
              { name: "Channel Name", value: `#${channel.name}`, inline: true },
              { name: "Type",         value: channel.type?.toString() ?? "Unknown", inline: true },
              { name: "Category",     value: channel.parent?.name ?? "None", inline: true },
              { name: "Deleted By",   value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
          ).setTimestamp(), "Event Log");
  }