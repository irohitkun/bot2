import { Events, AuditLogEvent } from "discord.js";
  import { trackAndCheck, punishAttacker } from "../utils/antinuke.js";

  export const name = Events.GuildBanAdd;
  export const once = false;

  export async function execute(ban) {
      const guild = ban.guild;
      try {
          // Try to find who issued the ban via audit log
          await new Promise(r => setTimeout(r, 500)); // small delay for audit log propagation
          const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).catch(() => null);
          const entry = logs?.entries?.first();
          if (!entry || !entry.executor) return;
          const executorId = entry.executor.id;
          if (executorId === guild.client.user.id) return; // bot's own actions

          const { trigger } = await trackAndCheck(guild, executorId, "ban");
          if (trigger) {
              console.warn(`[AntiNuke] Ban threshold exceeded by ${executorId} in ${guild.id}`);
              await punishAttacker(guild, guild.client, executorId);
          }
      } catch (err) {
          console.warn("[AntiNuke] guildBanAdd error:", err.message);
      }
  }
  