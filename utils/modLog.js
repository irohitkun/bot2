/**
 * Moderation log utility.
 *
 * Sends a log embed to the guild's configured mod-log channel (stored in
 * server_customization.log_channel_id).  Silently does nothing if no channel
 * is configured or the bot lacks permission — mod actions should never fail
 * because of a logging error.
 *
 * Usage:
 *   import { sendModLog, applyFooter } from "../utils/modLog.js";
 *   await sendModLog(guild, embed);
 *
 *   // To also stamp the footer on an embed before replying in-channel:
 *   applyFooter(embed, style);
 */

import { getLogChannel, getGuildStyle } from "./guildStyle.js";

/**
 * Apply the guild's custom footer (if set) to an embed, else use a default.
 * Mutates the embed in-place and returns it for chaining.
 *
 * @param {import("discord.js").EmbedBuilder} embed
 * @param {{ footer: string | null }} style
 * @param {string} [fallback]
 * @returns {import("discord.js").EmbedBuilder}
 */
export function applyFooter(embed, style, fallback = "") {
    const text = style?.footer ?? fallback;
    if (text) embed.setFooter({ text });
    return embed;
}

/**
 * Send a log embed to the guild's configured moderation log channel.
 * Never throws — all errors are swallowed to prevent disrupting the action.
 *
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").EmbedBuilder} embed
 */
export async function sendModLog(guild, embed) {
    try {
        const logChannelId = await getLogChannel(guild.id);
        if (!logChannelId) return;

        const channel = guild.channels.cache.get(logChannelId)
            ?? await guild.channels.fetch(logChannelId).catch(() => null);

        if (!channel?.isTextBased()) return;

        const style = await getGuildStyle(guild.id);
        applyFooter(embed, style, "Moderation Log");

        await channel.send({ embeds: [embed] });
    } catch {
        // Never let logging break moderation actions
    }
}
