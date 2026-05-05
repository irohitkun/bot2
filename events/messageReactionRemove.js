import { Events } from "discord.js";
import { db, reactionRolesTable, starboardSettingsTable, starboardEntriesTable } from "../db/index.js";
import { and, eq } from "drizzle-orm";

export const name = Events.MessageReactionRemove;
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
        console.warn("[ReactionRoles] DB error on reactionRemove lookup:", err.message);
    }

    if (row) {
        try {
            const member = await guild.members.fetch(user.id);
            await member.roles.remove(row.roleId, "Reaction role removed");
        } catch (err) {
            console.warn(`[ReactionRoles] Failed to remove role ${row.roleId} from ${user.id}:`, err.message);
        }
    }

    // ── Starboard — update count when a star is removed ───────────────────────
    await handleStarboardUpdate(reaction, guild, emoji).catch((e) =>
        console.warn("[Starboard] Remove update error:", e.message)
    );
}

function getStarRating(count, threshold) {
    const ratio = count / Math.max(threshold, 1);
    if (ratio >= 10) return { label: "⭐⭐⭐⭐⭐", color: 0xff4500 };
    if (ratio >= 5)  return { label: "⭐⭐⭐⭐",   color: 0xff7700 };
    if (ratio >= 3)  return { label: "⭐⭐⭐",     color: 0xff9900 };
    if (ratio >= 2)  return { label: "⭐⭐",       color: 0xffbb00 };
    return                   { label: "⭐",         color: 0xffd700 };
}

async function handleStarboardUpdate(reaction, guild, emoji) {
    const [settings] = await db.select().from(starboardSettingsTable)
        .where(and(eq(starboardSettingsTable.guildId, guild.id), eq(starboardSettingsTable.enabled, true)));
    if (!settings || emoji !== settings.emoji) return;

    const [existing] = await db.select().from(starboardEntriesTable)
        .where(eq(starboardEntriesTable.messageId, reaction.message.id));
    if (!existing) return;

    const starCount = reaction.count ?? 0;
    await db.update(starboardEntriesTable).set({ starCount }).where(eq(starboardEntriesTable.messageId, reaction.message.id));

    if (existing.starboardMessageId) {
        const starboardChannel = guild.channels.cache.get(settings.channelId)
            ?? await guild.channels.fetch(settings.channelId).catch(() => null);
        if (!starboardChannel?.isTextBased()) return;
        const sbMsg = await starboardChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
        if (sbMsg) {
            const { label } = getStarRating(starCount, settings.threshold);
            await sbMsg.edit({
                content: `${settings.emoji} **${starCount}** ${label} | <#${reaction.message.channelId}>`,
            }).catch(() => {});
        }
    }
}
