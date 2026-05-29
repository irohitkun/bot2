import { Events, EmbedBuilder } from "discord.js";
import { db, reactionRolesTable, starboardSettingsTable, starboardEntriesTable } from "../db/index.js";
import { and, eq } from "drizzle-orm";

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(reaction, user) {
    if (user.bot) return;

    if (reaction.partial) {
        try { await reaction.fetch(); } catch (e) {
            console.warn("[Starboard] Could not fetch partial reaction:", e.message);
            return;
        }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch (e) {
            console.warn("[Starboard] Could not fetch partial message:", e.message);
            return;
        }
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
    let settings;
    try {
        [settings] = await db.select().from(starboardSettingsTable)
            .where(and(eq(starboardSettingsTable.guildId, guild.id), eq(starboardSettingsTable.enabled, true)));
    } catch (err) {
        console.warn("[Starboard] DB error fetching settings:", err.message);
        return;
    }

    if (!settings) {
        // Uncomment the next line temporarily to debug missing settings:
        console.warn(`[Starboard] No enabled settings found for guild ${guild.id}`);
        return;
    }

    if (emoji !== settings.emoji) {
        console.warn(`[Starboard] Emoji mismatch — reaction:"${emoji}" (${[...emoji].map(c=>c.codePointAt(0).toString(16)).join(',')}) vs stored:"${settings.emoji}" (${[...settings.emoji].map(c=>c.codePointAt(0).toString(16)).join(',')})`);
        return;
    }

    const msg = reaction.message;

    if (msg.channelId === settings.channelId) {
        console.warn(`[Starboard] Ignored — message is inside the starboard channel itself`);
        return;
    }

    const starCount = reaction.count ?? 1;
    console.log(`[Starboard] ⭐ ${starCount}/${settings.threshold} on msg ${msg.id} in guild ${guild.id}`);

    const [existing] = await db.select().from(starboardEntriesTable)
        .where(eq(starboardEntriesTable.messageId, msg.id));

    // ── Update existing entry ────────────────────────────────────────────────
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
    if (starCount < settings.threshold) {
        console.warn(`[Starboard] Below threshold (${starCount} < ${settings.threshold}) — not posting yet`);
        return;
    }

    const starboardChannel = guild.channels.cache.get(settings.channelId)
        ?? await guild.channels.fetch(settings.channelId).catch(() => null);
    if (!starboardChannel?.isTextBased()) {
        console.warn(`[Starboard] Channel ${settings.channelId} not found or not text-based`);
        return;
    }

    // Insert FIRST to claim the slot and prevent duplicate posts.
    // Only swallow 23505 (unique_violation). Rethrow everything else.
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

    console.log(`[Starboard] Posting to starboard channel ${settings.channelId}...`);
    const embed = buildStarboardEmbed(msg, starCount, settings);
    const sbMsg = await starboardChannel.send({
        content: buildStarboardHeader(starCount, settings, msg.channelId),
        embeds: [embed],
    }).catch((e) => { console.warn("[Starboard] Failed to send message:", e.message); return null; });

    if (sbMsg) {
        console.log(`[Starboard] ✅ Posted starboard message ${sbMsg.id}`);
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
