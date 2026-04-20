/**
 * Fetch ALL messages from a Discord channel by paginating backwards.
 * Discord returns max 100 per request; this loops until the channel is exhausted.
 *
 * @param {import("discord.js").TextChannel} channel
 * @param {number} [maxMessages=2000]  safety cap to avoid runaway fetches
 * @returns {Promise<import("discord.js").Message[]>} chronological order (oldest first)
 */
export async function fetchAllMessages(channel, maxMessages = 2000) {
    const all = [];
    let lastId = undefined;

    while (all.length < maxMessages) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const batch = await channel.messages.fetch(options).catch(() => null);
        if (!batch || batch.size === 0) break;

        all.push(...batch.values());
        lastId = batch.last()?.id;

        if (batch.size < 100) break; // reached the beginning
    }

    // Return in chronological order (oldest first)
    return all.reverse();
}
