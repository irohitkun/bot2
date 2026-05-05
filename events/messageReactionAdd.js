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

    // Only care about the configured emoji
    if (emoji !== settings.emoji) return;

    // Don't star messages in the starboard channel itself
    if (reaction.message.channelId === settings.channelId) return;

    const starCount = reaction.count ?? 0;
    const msg = reaction.message;

    // Check if this message is already in the starboard
    const [existing] = await db.select().from(starboardEntriesTable)
        .where(eq(starboardEntriesTable.messageId, msg.id));

    const starboardChannel = guild.channels.cache.get(settings.channelId)
        ?? await guild.channels.fetch(settings.channelId).catch(() => null);
    if (!starboardChannel?.isTextBased()) return;

    const embed = buildStarboardEmbed(msg, starCount, settings.emoji);

    if (existing) {
        // Update existing starboard post's star count
        if (existing.starboardMessageId) {
            const sbMsg = await starboardChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
            if (sbMsg) await sbMsg.edit({ embeds: [embed] }).catch(() => {});
        }
        await db.update(starboardEntriesTable)
            .set({ starCount })
            .where(eq(starboardEntriesTable.messageId, msg.id));
        return;
    }

    // Not yet on the starboard — check if threshold reached
    if (starCount < settings.threshold) return;

    // Post to starboard
    const sbMsg = await starboardChannel.send({
        content: `${settings.emoji} **${starCount}** | <#${msg.channelId}>`,
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

function buildStarboardEmbed(msg, starCount, emoji) {
    const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setAuthor({
            name: msg.author?.tag ?? "Unknown",
            iconURL: msg.author?.displayAvatarURL() ?? undefined,
        })
        .setTimestamp(msg.createdAt)
        .setFooter({ text: `${emoji} ${starCount} · ${msg.id}` });

    if (msg.content) embed.setDescription(msg.content.slice(0, 4096));

    const image = msg.attachments.find((a) => a.contentType?.startsWith("image/"))
        ?? msg.embeds.find((e) => e.image)?.image;
    if (image?.url) embed.setImage(image.url);

    embed.addFields({ name: "Jump to message", value: `[Click here](${msg.url})` });
    return embed;
}
