const snipeCache = new Map();
export function setSnipe(channelId, message) {
    const imageUrl = message.attachments.find((a) => a.contentType?.startsWith("image/"))?.url ?? null;
    snipeCache.set(channelId, {
        content: message.content,
        authorId: message.author.id,
        authorTag: message.author.tag,
        authorAvatar: message.author.displayAvatarURL(),
        deletedAt: new Date(),
        imageUrl,
    });
}
export function getSnipe(channelId) {
    return snipeCache.get(channelId) ?? null;
}
export function clearSnipe(channelId) {
    return snipeCache.delete(channelId);
}
