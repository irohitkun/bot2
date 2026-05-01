/**
 * Moderation log utility.
 *
 * Sends a log embed to the guild's configured mod-log channel (stored in
 * server_customization.log_channel_id).  Errors are surfaced to console
 * so the bot owner can diagnose issues, but never thrown to the caller.
 *
 * Usage:
 *   import { sendModLog, applyFooter } from "../utils/modLog.js";
 *   await sendModLog(guild, embed);
 *   await sendModLog(guild, embed, "Event Log");   // custom footer fallback
 */

import { PermissionsBitField } from "discord.js";
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
 * Never throws. Errors are logged to console for diagnostics.
 *
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").EmbedBuilder} embed
 * @param {string} [footerFallback]  Footer text if guild has no custom footer set
 */
export async function sendModLog(guild, embed, footerFallback = "Moderation Log") {
    try {
        const logChannelId = await getLogChannel(guild.id);
        if (!logChannelId) return;

        const channel = guild.channels.cache.get(logChannelId)
            ?? await guild.channels.fetch(logChannelId).catch(() => null);

        if (!channel) {
            console.error(`[ModLog] Log channel ${logChannelId} not found in guild ${guild.id} — did it get deleted? Run /logs set to update it.`);
            return;
        }

        if (!channel.isTextBased()) {
            console.error(`[ModLog] Log channel ${logChannelId} in guild ${guild.id} is not a text channel.`);
            return;
        }

        const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
        if (me) {
            const perms = channel.permissionsFor(me);
            const missing = [];
            if (!perms?.has(PermissionsBitField.Flags.SendMessages)) missing.push("SendMessages");
            if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) missing.push("EmbedLinks");
            if (missing.length) {
                console.error(`[ModLog] Bot is missing ${missing.join(", ")} in log channel ${logChannelId} (guild ${guild.id}).`);
                return;
            }
        }

        const style = await getGuildStyle(guild.id);
        applyFooter(embed, style, footerFallback);

        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("[ModLog] Unexpected error sending log:", err);
    }
}
