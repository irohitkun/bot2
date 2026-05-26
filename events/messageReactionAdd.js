import { Events, EmbedBuilder } from "discord.js";
import { db, reactionRolesTable, starboardSettingsTable, starboardEntriesTable } from "../db/index.js";
import { and, eq } from "drizzle-orm";

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
        [row] = await db.select().from(reactionRolesTable)
            .where(and(
                eq(reactionRolesTable.messageId, reaction.message.id),
                eq(reactionRolesTable.emoji, emoji),
            ));
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
        .where(and(eq(starboardSettingsTable.guildId, guild.id), eq(starboardSettingsTable.enabled, true)));
    if (!settings) return;

    if (emoji !== settings.emoji) return;

    const msg = reaction.message;

    // Don't star messages inside the starboard channel itself
    if (msg.channelId === settings.channelId) return;

    // reaction.count can be null on very first fetch; fall back to 0
    const starCount = reaction.count ?? 0;

    const [existing] = await db.select().from(starboardEntriesTable)
        .where(eq(starboardEntriesTable.messageId, msg.id));

    // ── Update existing entry ────────────────────────────────────────────────
    if (existing) {
        await db.update(starboardEntriesTable)
            .set({ starCount })
            .where(eq(starboardEntriesTable.messageId, msg.id));

        // Edit the starboard post if one exists
        if (existing.starboardMessageId) {
            const starboardChannel = guild.channels.cache.get(settings.channelId)
                ?? await guild.channels.fetch(settings.channelId).catch(() => null);
            if (!starboardChannel?.isTextBased()) return;

            const sbMsg = await starboardChannel.messages
                .fetch(existing.starboardMessageId)
                .catch(() => null);
            if (sbMsg) {
                const embed = buildStarboardEmbed(msg, starCount, settings);
                await sbMsg.edit({
                    content: buildStarboardHeader(starCount, settings, msg.channelId),
                    embeds: [embed],
                }).catch(() => {});
            }
        }
        return;
    }

    // ── New entry — only post if threshold is met ────────────────────────────
    if (starCount < settings.threshold) return;

    const starboardChannel = guild.channels.cache.get(settings.channelId)
        ?? await guild.channels.fetch(settings.channelId).catch(() => null);
    if (!starboardChannel?.isTextBased()) return;

    // Insert FIRST to claim the slot and prevent duplicate posts from
    // concurrent reactions arriving at the same time.
    try {
        await db.insert(starboardEntriesTable).values({
            messageId: msg.id,
            guildId: guild.id,
            channelId: msg.channelId,
            authorId: msg.author?.id ?? "unknown",
            starboardMessageId: null,
            starCount,
        });
    } catch {
        // Another concurrent handler already inserted this entry.
        // Just update the count and exit — no duplicate post.
        await db.update(starboardEntriesTable)
            .set({ starCount })
            .where(eq(starboardEntriesTable.messageId, msg.id))
            .catch(() => {});
        return;
    }

    // We own this entry — now send the starboard post
    const embed = buildStarboardEmbed(msg, starCount, settings);
    const sbMsg = await starboardChannel.send({
        content: buildStarboardHeader(starCount, settings, msg.channelId),
        embeds: [embed],
    }).catch(() => null);

    if (sbMsg) {
        await db.update(starboardEntriesTable)
            .set({ starboardMessageId: sbMsg.id })
            .where(eq(starboardEntriesTable.messageId, msg.id))
            .catch(() => {});
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStarRating(count, threshold) {
    const ratio = count / Math.max(threshold, 1);
    if (ratio >= 10) return { stars: 5, label: "⭐⭐⭐⭐⭐", color: 0xff4500 };
    if (ratio >= 5)  return { stars: 4, label: "⭐⭐⭐⭐",   color: 0xff7700 };
    if (ratio >= 3)  return { stars: 3, label: "⭐⭐⭐",     color: 0xff9900 };
    if (ratio >= 2)  return { stars: 2, label: "⭐⭐",       color: 0xffbb00 };
    return                   { stars: 1, label: "⭐",         color: 0xffd700 };
}

function buildStarboardHeader(starCount, settings, channelId) {
    const { label } = getStarRating(starCount, settings.threshold);
    return `${settings.emoji} **${starCount}** ${label} | <#${channelId}>`;
}

function buildStarboardEmbed(msg, starCount, settings) {
    const { color, label } = getStarRating(starCount, settings.threshold);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name: msg.author?.tag ?? "Unknown",
            iconURL: msg.author?.displayAvatarURL() ?? undefined,
        })
        .setTimestamp(msg.createdAt)
        .setFooter({ text: `Quality: ${label} · ${starCount} ${settings.emoji} · ID: ${msg.id}` });

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
