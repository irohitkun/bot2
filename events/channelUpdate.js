import { Events, EmbedBuilder } from "discord.js";
  import { sendModLog } from "../utils/modLog.js";
  export const name = Events.ChannelUpdate;
  export const once = false;
  export async function execute(oldChannel, newChannel) {
      if (!newChannel.guild) return;
      const changes = [];
      if (oldChannel.name !== newChannel.name) changes.push({ name: "Name", before: oldChannel.name, after: newChannel.name });
      if (oldChannel.topic !== newChannel.topic) changes.push({ name: "Topic", before: oldChannel.topic ?? "*None*", after: newChannel.topic ?? "*None*" });
      if (oldChannel.nsfw !== newChannel.nsfw) changes.push({ name: "NSFW", before: String(oldChannel.nsfw), after: String(newChannel.nsfw) });
      if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push({ name: "Slowmode", before: `${oldChannel.rateLimitPerUser}s`, after: `${newChannel.rateLimitPerUser}s` });
      if (changes.length === 0) return;
      const embed = new EmbedBuilder().setColor(0xfee75c).setTitle("⚙️ Channel Updated")
          .addFields({ name: "Channel", value: newChannel.toString(), inline: false });
      for (const c of changes) embed.addFields({ name: c.name, value: `${c.before} → ${c.after}`, inline: true });
      await sendModLog(newChannel.guild, embed.setTimestamp(), "Event Log");
  }