import { Events, EmbedBuilder } from "discord.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.GuildRoleUpdate;
  export const once = false;
  export async function execute(oldRole, newRole) {
      const changes = [];
      if (oldRole.name !== newRole.name) changes.push({ name: "Name", before: oldRole.name, after: newRole.name });
      if (oldRole.hexColor !== newRole.hexColor) changes.push({ name: "Color", before: oldRole.hexColor, after: newRole.hexColor });
      if (oldRole.hoist !== newRole.hoist) changes.push({ name: "Hoisted", before: String(oldRole.hoist), after: String(newRole.hoist) });
      if (oldRole.mentionable !== newRole.mentionable) changes.push({ name: "Mentionable", before: String(oldRole.mentionable), after: String(newRole.mentionable) });
      if (changes.length === 0) return;
      const embed = new EmbedBuilder().setColor(0xfee75c).setTitle("✏️ Role Updated")
          .addFields({ name: "Role", value: newRole.toString(), inline: false });
      for (const c of changes) embed.addFields({ name: c.name, value: `${c.before} → ${c.after}`, inline: true });
      await sendModLog(newRole.guild, embed.setTimestamp(), "Event Log");
  }