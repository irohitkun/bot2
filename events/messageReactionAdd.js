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
    if (reaction.message.channelId === settings.channelId) return;

    const starCount = reaction.count ?? 0;
    const msg = reaction.message;

    const [existing] = await db.select().from(starboardEntriesTable)
        .where(eq(starboardEntriesTable.messageId, msg.id));

    const starboardChannel = guild.channels.cache.get(settings.channelId)
        ?? await guild.channels.fetch(settings.channelId).catch(() => null);
    if (!starboardChannel?.isTextBased()) return;

    const embed = buildStarboardEmbed(msg, starCount, settings);

    if (existing) {
        if (existing.starboardMessageId) {
            const sbMsg = await starboardChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
            if (sbMsg) {
                await sbMsg.edit({
                    content: buildStarboardHeader(starCount, settings, msg.channelId),
                    embeds: [embed],
                }).catch(() => {});
            }
        }
        await db.update(starboardEntriesTable).set({ starCount }).where(eq(starboardEntriesTable.messageId, msg.id));
        return;
    }

    if (starCount < settings.threshold) return;

    const sbMsg = await starboardChannel.send({
        content: buildStarboardHeader(starCount, settings, msg.channelId),
        embeds: [embed],
    }).catch(() => null);

    await db.insert(starboardEntriesTable).values({
        messageId: msg.id,
        guildId: guild.id,
        channelId: msg.channelId,
        authorId: msg.author?.id ?? "unknown",
        starboardMessageId: sbMsg?.id ?? null,
        starCount,
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStarRating(count, threshold) {
    const ratio = count / Math.max(threshold, 1);
    if (ratio >= 10) return { stars: 5, label: "⭐⭐⭐⭐⭐", color: 0xff4500 }; // Legendary
    if (ratio >= 5)  return { stars: 4, label: "⭐⭐⭐⭐",   color: 0xff7700 }; // Excellent
    if (ratio >= 3)  return { stars: 3, label: "⭐⭐⭐",     color: 0xff9900 }; // Great
    if (ratio >= 2)  return { stars: 2, label: "⭐⭐",       color: 0xffbb00 }; // Good
    return                   { stars: 1, label: "⭐",         color: 0xffd700 }; // Notable
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

    // Attach first image if any
    const attachment = msg.attachments.find((a) => a.contentType?.startsWith("image/"));
    const embedImage = msg.embeds.find((e) => e.image)?.image;
    if (attachment?.url) embed.setImage(attachment.url);
    else if (embedImage?.url) embed.setImage(embedImage.url);

    embed.addFields({ name: "📎 Source", value: `[Jump to message](${msg.url}) in <#${msg.channelId}>`, inline: false });

    return embed;
}
