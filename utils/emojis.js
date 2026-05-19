/**
 * Emoji Server Utility
 * --------------------
 * The bot loads all emojis from your designated emoji server (EMOJI_SERVER_ID).
 * Add animated or custom emojis there and reference them by name here.
 *
 * Usage anywhere in the bot:
 *   import { e } from "../utils/emojis.js";
 *   channel.send(`${e("verified")} Done!`);       // → <a:verified:123456>
 *   channel.send(`${e("loading")} Please wait…`); // → <a:loading:789012>
 *
 * Falls back to a plain-text alternative if the emoji isn't found.
 */

import { client } from "../index.js";

const emojiCache = new Map();
let loaded = false;

/**
 * Load all emojis from the emoji server into the cache.
 * Called once on ready. Safe to call multiple times.
 */
export async function loadEmojiServer() {
    const serverId = process.env.EMOJI_SERVER_ID;
    if (!serverId) {
        console.log("[Emojis] EMOJI_SERVER_ID not set — custom emojis disabled.");
        return;
    }

    try {
        const guild = client.guilds.cache.get(serverId)
            ?? await client.guilds.fetch(serverId).catch(() => null);

        if (!guild) {
            console.warn(`[Emojis] Emoji server ${serverId} not found — is the bot in that server?`);
            return;
        }

        const emojis = await guild.emojis.fetch();
        emojiCache.clear();
        for (const emoji of emojis.values()) {
            emojiCache.set(emoji.name.toLowerCase(), emoji);
        }
        loaded = true;
        console.log(`[Emojis] Loaded ${emojiCache.size} emoji(s) from "${guild.name}"`);
    } catch (err) {
        console.error("[Emojis] Failed to load emoji server:", err.message);
    }
}

/**
 * Get an emoji string by name, ready to use inline in messages.
 * Returns the animated/custom emoji if found, otherwise the fallback.
 *
 * @param {string} name - The emoji name (case-insensitive, e.g. "verified")
 * @param {string} [fallback=""] - What to show if the emoji isn't found
 * @returns {string}
 */
export function e(name, fallback = "") {
    const emoji = emojiCache.get(name.toLowerCase());
    if (!emoji) return fallback;
    return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
}

/**
 * Get a raw emoji object by name, or null if not found.
 * Useful when you need the full GuildEmoji object.
 *
 * @param {string} name
 * @returns {import("discord.js").GuildEmoji | null}
 */
export function getEmoji(name) {
    return emojiCache.get(name.toLowerCase()) ?? null;
}

/**
 * List all loaded emoji names — handy for debugging.
 * @returns {string[]}
 */
export function listEmojis() {
    return [...emojiCache.keys()];
}

export { loaded };
