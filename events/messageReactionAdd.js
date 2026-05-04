import { Events } from "discord.js";
import { db } from "../db/index.js";
import { reactionRolesTable } from "../db/schema.js";
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

    let row;
    try {
        [row] = await db.select().from(reactionRolesTable)
            .where(and(
                eq(reactionRolesTable.messageId, reaction.message.id),
                eq(reactionRolesTable.emoji, emoji),
            ));
    } catch (err) {
        console.warn("[ReactionRoles] DB error on reactionAdd lookup:", err.message);
        return;
    }

    if (!row) return;

    try {
        const member = await guild.members.fetch(user.id);
        await member.roles.add(row.roleId, "Reaction role");
    } catch (err) {
        console.warn(`[ReactionRoles] Failed to add role ${row.roleId} to ${user.id}:`, err.message);
    }
}
