import { Events, EmbedBuilder } from "discord.js";
import { db, reactionRolesTable, starboardSettingsTable, starboardEntriesTable } from "../db/index.js";
import { eq } from "drizzle-orm";

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(reaction, user) {
    if (user.bot) return;

    if (reaction.partial) {
        try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch { return; }
    }

    const guild = reaction.message.guild;
    if (!guild) return;

    const emoji = reaction.emoji.id
        ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;

    // ── Reaction Roles ────────────────────────────────────────────────────────
    let row;
    try {
        // Fetch all reaction-role entries for this message, then match emoji in JS.
        // This avoids a Drizzle ORM parameter-index bug when using and(eq(), eq()).
        const rows = await db.select().from(reactionRolesTable)
            .where(eq(reactionRolesTable.messageId, reaction.message.id));
        row = rows.find((r) => r.emoji === emoji);
    } catch (err) {
        console.warn("[ReactionRoles] DB error on reactionAdd lookup:", err.message);
    }

    if (row) {
        try {
            const member = await guild.members.fetch(user.id);
            await member.roles.add(row.roleId, "Reaction role");
        } catch (err) {
            console.warn(`[ReactionRoles] Failed to add role ${row.roleId} to ${user.id}:`, err.message);
        }
    }

    // ── Starboard ─────────────────────────────────────────────────────────────
    await handleStarboard(reaction, guild, emoji).catch((e) =>
        console.warn("[Starboard] Error:", e.message)
    );
}

async function handleStarboard(reaction, guild, emoji) {
    const [settings] = await db.select().from(starboardSettingsTable)
        .where(eq(starboardSettingsTable.guildId, guild.id));
    if (!settings?.enabled) return;

    const storedId = parseEmojiId(settings.emoji);
    const reactionId = reaction.emoji.id ?? null;
    const emojiMatches = storedId && reactionId
        ? storedId === reactionId
        : emoji === settings.emoji;

    if (!emojiMatches) return;

    const msg = reaction.message;
    if (msg.channelId === settings.channelId) return;

    const starCount = reaction.count ?? 1;

    const [existing] = await db.select().from(starboardEntriesTable)
        .where(eq(starboardEntriesTable.messageId, msg.id));

    if (existing) {
        await db.update(starboardEntriesTable)
            .set({ starCount })
            .where(eq(starboardEntriesTable.messageId, msg.id));

        if (existing.starboardMessageId) {
            const starboardChannel = guild.channels.cache.get(settings.channelId)
                ?? await guild.channels.fetch(settings.channelId).catch(() => null);
            if (!starboardChannel?.isTextBased()) return;

            const sbMsg = await starboardChannel.messages
                .fetch(existing.starboardMessageId)
                .catch(() => null);
            if (sbMsg) {
                await sbMsg.edit({
                    content: buildStarboardHeader(starCount, settings, msg.channelId),
                    embeds: [buildStarboardEmbed(msg, starCount, settings)],
                }).catch(() => {});
            }
        }
        return;
    }

    if (starCount < settings.threshold) return;

    const starboardChannel = guild.channels.cache.get(settings.channelId)
        ?? await guild.channels.fetch(settings.channelId).catch(() => null);
    if (!starboardChannel?.isTextBased()) return;

    try {
        await db.insert(starboardEntriesTable).values({
            messageId: msg.id,
            guildId: guild.id,
            channelId: msg.channelId,
            authorId: msg.author?.id ?? "unknown",
            starboardMessageId: null,
            starCount,
        });
    } catch (err) {
        const code = err?.code ?? err?.cause?.code;
        if (code === "23505") {
            await db.update(starboardEntriesTable)
                .set({ starCount })
                .where(eq(starboardEntriesTable.messageId, msg.id))
                .catch(() => {});
            return;
        }
        throw err;
    }

    const sbMsg = await starboardChannel.send({
        content: buildStarboardHeader(starCount, settings, msg.channelId),
        embeds: [buildStarboardEmbed(msg, starCount, settings)],
    }).catch(() => null);

    if (sbMsg) {
        await db.update(starboardEntriesTable)
            .set({ starboardMessageId: sbMsg.id })
            .where(eq(starboardEntriesTable.messageId, msg.id))
            .catch(() => {});
    }
}

function parseEmojiId(emojiStr) {
    const match = emojiStr?.match(/^<a?:\w+:(\d+)>$/);
    return match ? match[1] : null;
}

function getStarRating(count, threshold) {
    const ratio = count / Math.max(threshold, 1);
    if (ratio >= 10) return { color: 0xff4500 };
    if (ratio >= 5)  return { color: 0xff7700 };
    if (ratio >= 3)  return { color: 0xff9900 };
    if (ratio >= 2)  return { color: 0xffbb00 };
    return           { color: 0xffd700 };
}

function buildStarboardHeader(starCount, settings, channelId) {
    return `${settings.emoji} **${starCount}** | <#${channelId}>`;
}

function buildStarboardEmbed(msg, starCount, settings) {
    const { color } = getStarRating(starCount, settings.threshold);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name: msg.author?.tag ?? "Unknown",
            iconURL: msg.author?.displayAvatarURL() ?? undefined,
        })
        .setTimestamp(msg.createdAt)
        .setFooter({ text: `${starCount} ${settings.emoji} · ID: ${msg.id}` });

    if (msg.content) embed.setDescription(msg.content.slice(0, 4096));

    const attachment = msg.attachments.find((a) => a.contentType?.startsWith("image/"));
    const embedImage = msg.embeds.find((e) => e.image)?.image;
    if (attachment?.url) embed.setImage(attachment.url);
    else if (embedImage?.url) embed.setImage(embedImage.url);

    embed.addFields({
        name: "📎 Source",
        value: `[Jump to message](${msg.url}) in <#${msg.channelId}>`,
        inline: false,
    });

    return embed;
}
