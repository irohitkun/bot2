import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.GuildRoleCreate;
  export const once = false;
  export async function execute(role) {
      let executorId = null;
      try {
          const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
          const entry = logs.entries.first();
          if (entry && (Date.now() - entry.createdTimestamp) < 5000) executorId = entry.executor?.id;
      } catch {}
      await sendModLog(role.guild, new EmbedBuilder().setColor(0x57f287).setTitle("✅ Role Created")
          .addFields(
              { name: "Role",        value: role.toString(), inline: true },
              { name: "Created By",  value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
              { name: "Color",       value: role.hexColor, inline: true },
              { name: "Mentionable", value: String(role.mentionable), inline: true },
              { name: "Hoisted",     value: String(role.hoist), inline: true },
          ).setTimestamp(), "Event Log");
  }