import { EmbedBuilder } from "discord.js";

  let _client = null;

  export function initErrorLogger(client) {
      _client = client;
  }

  async function sendErrorEmbed(title, description, color = 0xed4245) {
      const channelId = process.env.ERROR_LOG_CHANNEL_ID;
      if (!channelId || !_client) return;
      try {
          const channel = _client.channels.cache.get(channelId)
              ?? await _client.channels.fetch(channelId).catch(() => null);
          if (!channel?.isTextBased()) return;
          const embed = new EmbedBuilder()
              .setColor(color)
              .setTitle(title)
              .setDescription(`\`\`\`\n${description.slice(0, 3900)}\n\`\`\``)
              .setTimestamp();
          await channel.send({ embeds: [embed] }).catch(() => {});
      } catch {
          // Never throw from the error logger
      }
  }

  export function logUnhandledRejection(reason) {
      const text = reason instanceof Error
          ? `${reason.message}\n\n${reason.stack ?? ""}`
          : String(reason);
      console.error("[Process] Unhandled promise rejection:", reason);
      sendErrorEmbed("⚠️ Unhandled Promise Rejection", text);
  }

  export function logUncaughtException(err) {
      const text = `${err.message}\n\n${err.stack ?? ""}`;
      console.error("[Process] Uncaught exception:", err);
      sendErrorEmbed("🔴 Uncaught Exception", text);
  }

  export function logCommandError(commandName, err) {
      const text = `**Command:** \`/${commandName}\`\n\n${err.message}\n\n${err.stack ?? ""}`;
      console.error(`[Command:${commandName}] Error:`, err);
      sendErrorEmbed("🔧 Command Error", text, 0xffa500);
  }
  