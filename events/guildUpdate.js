import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.GuildUpdate;
  export const once = false;
  export async function execute(oldGuild, newGuild) {
      const changes = [];
      if (oldGuild.name !== newGuild.name) changes.push({ name: "Server Name", before: oldGuild.name, after: newGuild.name });
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push({ name: "Verification Level", before: String(oldGuild.verificationLevel), after: String(newGuild.verificationLevel) });
      if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) changes.push({ name: "Content Filter", before: String(oldGuild.explicitContentFilter), after: String(newGuild.explicitContentFilter) });
      if (changes.length === 0) return;
      let executorId = null;
      try {
          const logs = await newGuild.fetchAuditLogs({ type: AuditLogEvent.GuildUpdate, limit: 1 });
          const entry = logs.entries.first();
          if (entry && (Date.now() - entry.createdTimestamp) < 5000) executorId = entry.executor?.id;
      } catch {}
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("⚙️ Server Updated")
          .addFields({ name: "Changed By", value: executorId ? `<@${executorId}>` : "Unknown", inline: false });
      for (const c of changes) embed.addFields({ name: c.name, value: `${c.before} → ${c.after}`, inline: true });
      await sendModLog(newGuild, embed.setTimestamp(), "Event Log");
  }