/**
 * Embed Template Utilities
 *
 * Templates are stored in `embed_templates` table per guild.
 * Variable substitution is supported everywhere text appears:
 *   {user}        → member mention (@username)
 *   {user.name}   → username
 *   {user.tag}    → user#discriminator
 *   {user_avatar} → user avatar URL  (also usable in thumbnail/image fields)
 *   {server}      → server name
 *   {server_icon} → server icon URL  (also usable in thumbnail/image fields)
 *   {count}       → guild member count
 */
import { EmbedBuilder } from "discord.js";
import { db, embedTemplatesTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "./guildStyle.js";

/** Replace all supported variables in a string */
export function applyVars(text, vars = {}) {
    if (!text) return text;
    return text
        .replace(/\{user\}/gi, vars.userMention ?? "")
        .replace(/\{user\.name\}/gi, vars.userName ?? "")
        .replace(/\{user\.tag\}/gi, vars.userTag ?? "")
        .replace(/\{user_avatar\}/gi, vars.userAvatar ?? "")
        .replace(/\{server\}/gi, vars.serverName ?? "")
        .replace(/\{server_icon\}/gi, vars.serverIcon ?? "")
        .replace(/\{count\}/gi, vars.count != null ? String(vars.count) : "");
}

/** Build vars object from a guild member */
export function varsFromMember(member) {
    return {
        userMention: member.toString(),
        userName: member.user.username,
        userTag: member.user.tag,
        userAvatar: member.user.displayAvatarURL({ size: 256 }),
        serverName: member.guild.name,
        serverIcon: member.guild.iconURL({ size: 256 }) ?? "",
        count: member.guild.memberCount,
    };
}

/** Build an EmbedBuilder from a stored template row, applying optional vars */
export function buildEmbedFromTemplate(template, vars = {}, fallbackColor = 0x5865f2) {
    let color = fallbackColor;
    if (template.color) {
        const c = parseInt(template.color.replace("#", ""), 16);
        if (!isNaN(c)) color = c;
    }

    const embed = new EmbedBuilder().setColor(color);

    if (template.title) {
        embed.setTitle(applyVars(template.title, vars));
    }
    if (template.description) {
        embed.setDescription(applyVars(template.description, vars));
    }
    if (template.footerText) {
        const footerText = applyVars(template.footerText, vars);
        const footerIcon = template.footerIconUrl ? applyVars(template.footerIconUrl, vars) : undefined;
        embed.setFooter({ text: footerText, iconURL: footerIcon });
    }
    if (template.thumbnailUrl) {
        const url = applyVars(template.thumbnailUrl, vars);
        if (url && url.startsWith("http")) embed.setThumbnail(url);
    }
    if (template.imageUrl) {
        const url = applyVars(template.imageUrl, vars);
        if (url && url.startsWith("http")) embed.setImage(url);
    }
    if (template.authorName) {
        const authorIcon = template.authorIconUrl ? applyVars(template.authorIconUrl, vars) : undefined;
        embed.setAuthor({ name: applyVars(template.authorName, vars), iconURL: authorIcon });
    }
    if (template.fieldsJson) {
        try {
            const fields = JSON.parse(template.fieldsJson);
            for (const field of fields) {
                embed.addFields({
                    name: applyVars(field.name, vars),
                    value: applyVars(field.value, vars),
                    inline: field.inline ?? false,
                });
            }
        } catch {}
    }
    embed.setTimestamp();
    return embed;
}

/** Fetch a template by name for a guild */
export async function getTemplate(guildId, name) {
    const [row] = await db.select().from(embedTemplatesTable)
        .where(and(eq(embedTemplatesTable.guildId, guildId), eq(embedTemplatesTable.name, name.toLowerCase())));
    return row ?? null;
}

/** List all templates for a guild */
export async function listTemplates(guildId) {
    return db.select().from(embedTemplatesTable).where(eq(embedTemplatesTable.guildId, guildId));
}

/** Delete a template by name */
export async function deleteTemplate(guildId, name) {
    const result = await db.delete(embedTemplatesTable)
        .where(and(eq(embedTemplatesTable.guildId, guildId), eq(embedTemplatesTable.name, name.toLowerCase())))
        .returning();
    return result.length > 0;
}

/** Upsert a template */
export async function upsertTemplate(guildId, name, data, createdBy) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    await db.insert(embedTemplatesTable).values({
        guildId,
        name: normalized,
        title: data.title || null,
        description: data.description || null,
        color: data.color || null,
        footerText: data.footerText || null,
        footerIconUrl: data.footerIconUrl || null,
        thumbnailUrl: data.thumbnailUrl || null,
        imageUrl: data.imageUrl || null,
        authorName: data.authorName || null,
        authorIconUrl: data.authorIconUrl || null,
        fieldsJson: data.fieldsJson || null,
        createdBy,
        updatedAt: new Date(),
    }).onConflictDoUpdate({
        target: [embedTemplatesTable.guildId, embedTemplatesTable.name],
        set: {
            title: data.title || null,
            description: data.description || null,
            color: data.color || null,
            footerText: data.footerText || null,
            footerIconUrl: data.footerIconUrl || null,
            thumbnailUrl: data.thumbnailUrl || null,
            imageUrl: data.imageUrl || null,
            authorName: data.authorName || null,
            authorIconUrl: data.authorIconUrl || null,
            fieldsJson: data.fieldsJson || null,
            updatedAt: new Date(),
        },
    });
    return normalized;
}
