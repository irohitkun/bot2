export function parseMention(mention) {
    const match = mention.match(/^<@!?(\d+)>$/);
    return match ? match[1] : null;
}
export function parseDuration(input) {
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match)
        return null;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit] * 1000;
}
/**
 * Reply to a message and auto-delete the reply after `delayMs` (default 8s).
 * Use for all error / usage / syntax replies.
 */
export async function autoDeleteReply(message, content, delayMs = 8000) {
    try {
        const r = await message.reply(typeof content === "string" ? { content } : content);
        if (r) setTimeout(() => r.delete().catch(() => {}), delayMs);
        return r;
    } catch {}
}
/**
 * Replace the `%` prefix placeholder in a usage string with the server's
 * actual prefix (stored on message._prefix by messageCreate.js).
 */
export function fmtUsage(usage, message) {
    const p = message._prefix ?? "%";
    return usage.replace(/%/g, p);
}
