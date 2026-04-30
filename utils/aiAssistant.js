/**
 * Premium AI Assistant
 * --------------------
 * Takes a natural-language prompt and turns it into a sequence of moderation /
 * server-management actions executed against the calling user's Discord
 * permissions.  Every action is gated by:
 *   1. The invoking user holding the matching Discord permission.
 *   2. The bot itself holding the matching Discord permission.
 *   3. Role hierarchy (target role must sit below both invoker and bot).
 *   4. Hard ceilings (action count, purge size, timeout duration, etc.).
 *
 * The AI never gets to bypass Discord permissions — it only proposes actions
 * the calling user could already perform manually.
 *
 * Plans containing destructive actions (ban / kick / purge / lock_channel) are
 * shown as a preview with Approve / Cancel buttons before anything is run.
 */

import {
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { randomBytes } from "crypto";
import { and, count, eq } from "drizzle-orm";
import { createAIChatCompletion, getAIStatus, getAssistantModel } from "./aiProvider.js";
import { db, warningsTable, aiAssistantLogsTable, ticketSettingsTable } from "../db/index.js";
import { sendModLog } from "./modLog.js";
import { getGuildStyle } from "./guildStyle.js";

export const MAX_ACTIONS = 10;
const MAX_PURGE = 100;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const MAX_SLOWMODE_SECONDS = 21600; // Discord cap
const PLAN_TTL_MS = 5 * 60 * 1000;  // pending plans expire after 5 minutes

const DESTRUCTIVE_TOOLS = new Set([
    "ban_member",
    "kick_member",
    "purge_messages",
    "lock_channel",
    "delete_channel",
    "delete_role",
    "send_announcement",
]);

const PERM_LABELS = new Map([
    [PermissionFlagsBits.BanMembers, "Ban Members"],
    [PermissionFlagsBits.KickMembers, "Kick Members"],
    [PermissionFlagsBits.ModerateMembers, "Moderate Members"],
    [PermissionFlagsBits.ManageMessages, "Manage Messages"],
    [PermissionFlagsBits.ManageChannels, "Manage Channels"],
    [PermissionFlagsBits.ManageRoles, "Manage Roles"],
    [PermissionFlagsBits.ManageNicknames, "Manage Nicknames"],
    [PermissionFlagsBits.ManageGuild, "Manage Server"],
    [PermissionFlagsBits.SendMessages, "Send Messages"],
]);

function permLabel(perm) {
    return PERM_LABELS.get(perm) ?? "Required";
}

// ── Resolvers ───────────────────────────────────────────────────────────────

function extractId(value) {
    if (!value) return null;
    const str = String(value).trim();
    const mention = str.match(/^<@!?(\d+)>$/) ?? str.match(/^<@&(\d+)>$/) ?? str.match(/^<#(\d+)>$/);
    if (mention) return mention[1];
    if (/^\d{15,21}$/.test(str)) return str;
    return null;
}

async function resolveMember(guild, value) {
    if (!value) return null;
    const id = extractId(value);
    if (id) {
        const fetched = await guild.members.fetch(id).catch(() => null);
        if (fetched) return fetched;
    }
    const lower = String(value).toLowerCase().trim().replace(/^@/, "");
    const cached = guild.members.cache.find((m) =>
        m.user.username.toLowerCase() === lower ||
        m.user.tag.toLowerCase() === lower ||
        (m.displayName ?? "").toLowerCase() === lower
    );
    if (cached) return cached;
    const search = await guild.members.search({ query: lower, limit: 1 }).catch(() => null);
    if (search?.size) return search.first();
    return null;
}

async function resolveChannel(guild, value, fallback) {
    if (!value) return fallback ?? null;
    const id = extractId(value);
    if (id) {
        const ch = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
        if (ch) return ch;
    }
    const lower = String(value).toLowerCase().trim().replace(/^#/, "");
    return guild.channels.cache.find((c) => c.name.toLowerCase() === lower) ?? fallback ?? null;
}

function resolveRole(guild, value) {
    if (!value) return null;
    const id = extractId(value);
    if (id) {
        const role = guild.roles.cache.get(id);
        if (role) return role;
    }
    const lower = String(value).toLowerCase().trim().replace(/^@/, "");
    return guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ?? null;
}

function parseDuration(input) {
    if (input == null) return null;
    const str = String(input).trim().toLowerCase();
    const match = str.match(/^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days)?$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    const unit = match[2] ?? "m";
    const seconds =
        unit.startsWith("s") ? value :
        unit.startsWith("h") ? value * 3600 :
        unit.startsWith("d") ? value * 86400 :
        value * 60; // default minutes
    return seconds * 1000;
}

// ── Hierarchy helpers ───────────────────────────────────────────────────────

function canInvokerTarget(invoker, target) {
    if (target.id === invoker.id) return { ok: false, reason: "You cannot target yourself." };
    if (target.id === target.guild.ownerId) return { ok: false, reason: "Target is the server owner." };
    if (invoker.id === invoker.guild.ownerId) return { ok: true };
    if (target.roles.highest.position >= invoker.roles.highest.position) {
        return { ok: false, reason: "Target's top role is at or above yours." };
    }
    return { ok: true };
}

function canBotManageRole(guild, role) {
    if (role.managed) return { ok: false, reason: `Role @${role.name} is managed by an integration.` };
    if (role.id === guild.id) return { ok: false, reason: "Cannot assign @everyone." };
    const botTop = guild.members.me.roles.highest.position;
    if (role.position >= botTop) return { ok: false, reason: `Role @${role.name} is at or above my highest role.` };
    return { ok: true };
}

function canInvokerAssignRole(invoker, role) {
    if (invoker.id === invoker.guild.ownerId) return { ok: true };
    if (role.position >= invoker.roles.highest.position) {
        return { ok: false, reason: `Role @${role.name} is at or above your highest role.` };
    }
    return { ok: true };
}

function checkPermissions(member, perm) {
    return member.permissions.has(perm);
}

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = {
    ban_member: {
        userPerm: PermissionFlagsBits.BanMembers,
        botPerm: PermissionFlagsBits.BanMembers,
        describe: (a) => `Ban **${a.user ?? "?"}**${a.reason ? ` — ${a.reason}` : ""}${a.delete_days ? ` (delete ${a.delete_days}d msgs)` : ""}`,
        async execute(ctx, args) {
            const target = await resolveMember(ctx.guild, args.user);
            if (!target) return fail(`Member \`${args.user ?? "?"}\` not found.`);
            const hier = canInvokerTarget(ctx.member, target);
            if (!hier.ok) return fail(hier.reason);
            if (!target.bannable) return fail(`I can't ban ${target.user.tag} (role hierarchy).`);
            const reason = String(args.reason ?? "AI Assistant action").slice(0, 480);
            const deleteDays = clampInt(args.delete_days, 0, 7, 0);
            await target.ban({ deleteMessageSeconds: deleteDays * 86400, reason: `${reason} • via ${ctx.member.user.tag} (AI)` });
            await sendModLog(ctx.guild, modEmbed(0xed4245, "🔨 Member Banned (AI)", target, ctx.member, reason, [
                { name: "Messages Deleted", value: `${deleteDays} day(s)`, inline: true },
            ]));
            return ok(`Banned **${target.user.tag}** — ${reason}`);
        },
    },

    kick_member: {
        userPerm: PermissionFlagsBits.KickMembers,
        botPerm: PermissionFlagsBits.KickMembers,
        describe: (a) => `Kick **${a.user ?? "?"}**${a.reason ? ` — ${a.reason}` : ""}`,
        async execute(ctx, args) {
            const target = await resolveMember(ctx.guild, args.user);
            if (!target) return fail(`Member \`${args.user ?? "?"}\` not found.`);
            const hier = canInvokerTarget(ctx.member, target);
            if (!hier.ok) return fail(hier.reason);
            if (!target.kickable) return fail(`I can't kick ${target.user.tag} (role hierarchy).`);
            const reason = String(args.reason ?? "AI Assistant action").slice(0, 480);
            await target.kick(`${reason} • via ${ctx.member.user.tag} (AI)`);
            await sendModLog(ctx.guild, modEmbed(0xfee75c, "👟 Member Kicked (AI)", target, ctx.member, reason));
            return ok(`Kicked **${target.user.tag}** — ${reason}`);
        },
    },

    timeout_member: {
        userPerm: PermissionFlagsBits.ModerateMembers,
        botPerm: PermissionFlagsBits.ModerateMembers,
        describe: (a) => `Timeout **${a.user ?? "?"}** for ${a.duration ?? "?"}${a.reason ? ` — ${a.reason}` : ""}`,
        async execute(ctx, args) {
            const target = await resolveMember(ctx.guild, args.user);
            if (!target) return fail(`Member \`${args.user ?? "?"}\` not found.`);
            const hier = canInvokerTarget(ctx.member, target);
            if (!hier.ok) return fail(hier.reason);
            if (!target.moderatable) return fail(`I can't timeout ${target.user.tag} (role hierarchy).`);
            const ms = parseDuration(args.duration);
            if (!ms) return fail(`Invalid duration \`${args.duration ?? ""}\`. Use formats like 10m, 1h, 2d.`);
            if (ms > MAX_TIMEOUT_MS) return fail("Timeout cannot exceed 28 days.");
            const reason = String(args.reason ?? "AI Assistant action").slice(0, 480);
            await target.timeout(ms, `${reason} • via ${ctx.member.user.tag} (AI)`);
            await sendModLog(ctx.guild, modEmbed(0xf47b67, "🔇 Member Timed Out (AI)", target, ctx.member, reason, [
                { name: "Duration", value: String(args.duration), inline: true },
                { name: "Expires", value: `<t:${Math.floor((Date.now() + ms) / 1000)}:R>`, inline: true },
            ]));
            return ok(`Timed out **${target.user.tag}** for ${args.duration} — ${reason}`);
        },
    },

    untimeout_member: {
        userPerm: PermissionFlagsBits.ModerateMembers,
        botPerm: PermissionFlagsBits.ModerateMembers,
        describe: (a) => `Remove timeout from **${a.user ?? "?"}**${a.reason ? ` — ${a.reason}` : ""}`,
        async execute(ctx, args) {
            const target = await resolveMember(ctx.guild, args.user);
            if (!target) return fail(`Member \`${args.user ?? "?"}\` not found.`);
            if (!target.moderatable) return fail(`I can't untimeout ${target.user.tag} (role hierarchy).`);
            const reason = String(args.reason ?? "AI Assistant action").slice(0, 480);
            await target.timeout(null, `${reason} • via ${ctx.member.user.tag} (AI)`);
            await sendModLog(ctx.guild, modEmbed(0x57f287, "🔊 Timeout Removed (AI)", target, ctx.member, reason));
            return ok(`Removed timeout from **${target.user.tag}**`);
        },
    },

    warn_member: {
        userPerm: PermissionFlagsBits.ModerateMembers,
        botPerm: null,
        describe: (a) => `Warn **${a.user ?? "?"}** — ${a.reason ?? "(no reason)"}`,
        async execute(ctx, args) {
            const target = await resolveMember(ctx.guild, args.user);
            if (!target) return fail(`Member \`${args.user ?? "?"}\` not found.`);
            const hier = canInvokerTarget(ctx.member, target);
            if (!hier.ok) return fail(hier.reason);
            const reason = String(args.reason ?? "AI Assistant action").slice(0, 480);
            await db.insert(warningsTable).values({
                guildId: ctx.guild.id,
                userId: target.id,
                userTag: target.user.tag,
                moderatorId: ctx.member.id,
                moderatorTag: ctx.member.user.tag,
                reason,
            });
            const [{ value: total }] = await db.select({ value: count() }).from(warningsTable)
                .where(and(eq(warningsTable.guildId, ctx.guild.id), eq(warningsTable.userId, target.id)));
            await target.send(`⚠️ You have been warned in **${ctx.guild.name}** by ${ctx.member.user.tag} (via AI Assistant).\n**Reason:** ${reason}\nYou now have **${total}** warning(s).`).catch(() => {});
            await sendModLog(ctx.guild, modEmbed(0xfee75c, "⚠️ Member Warned (AI)", target, ctx.member, reason, [
                { name: "Total Warnings", value: `${total}`, inline: true },
            ]));
            return ok(`Warned **${target.user.tag}** (total: ${total}) — ${reason}`);
        },
    },

    purge_messages: {
        userPerm: PermissionFlagsBits.ManageMessages,
        botPerm: PermissionFlagsBits.ManageMessages,
        describe: (a) => `Purge ${clampInt(a.count, 1, MAX_PURGE, 10)} messages${a.user ? ` from ${a.user}` : ""}${a.channel ? ` in ${a.channel}` : ""}`,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, ctx.channel);
            if (!channel?.isTextBased()) return fail("Target channel is not text-based.");
            const requested = clampInt(args.count, 1, MAX_PURGE, 10);
            const fetched = await channel.messages.fetch({ limit: requested });
            let toDelete = [...fetched.values()];
            if (args.user) {
                const filterMember = await resolveMember(ctx.guild, args.user);
                if (filterMember) toDelete = toDelete.filter((m) => m.author.id === filterMember.id);
            }
            const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
            toDelete = toDelete.filter((m) => m.createdTimestamp > cutoff);
            if (toDelete.length === 0) return fail(`No eligible messages found in ${channel}.`);
            const deleted = await channel.bulkDelete(toDelete, true);
            return ok(`Purged **${deleted.size}** messages in ${channel}.`);
        },
    },

    lock_channel: {
        userPerm: PermissionFlagsBits.ManageChannels,
        botPerm: PermissionFlagsBits.ManageChannels,
        describe: (a) => `Lock ${a.channel ?? "the current channel"}${a.reason ? ` — ${a.reason}` : ""}`,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, ctx.channel);
            if (!channel?.permissionOverwrites) return fail("Target channel does not support permission overwrites.");
            const reason = String(args.reason ?? "Locked via AI Assistant").slice(0, 480);
            await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: false }, { reason: `${reason} • via ${ctx.member.user.tag} (AI)` });
            return ok(`Locked ${channel} — ${reason}`);
        },
    },

    unlock_channel: {
        userPerm: PermissionFlagsBits.ManageChannels,
        botPerm: PermissionFlagsBits.ManageChannels,
        describe: (a) => `Unlock ${a.channel ?? "the current channel"}${a.reason ? ` — ${a.reason}` : ""}`,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, ctx.channel);
            if (!channel?.permissionOverwrites) return fail("Target channel does not support permission overwrites.");
            const reason = String(args.reason ?? "Unlocked via AI Assistant").slice(0, 480);
            await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: null }, { reason: `${reason} • via ${ctx.member.user.tag} (AI)` });
            return ok(`Unlocked ${channel} — ${reason}`);
        },
    },

    set_slowmode: {
        userPerm: PermissionFlagsBits.ManageChannels,
        botPerm: PermissionFlagsBits.ManageChannels,
        describe: (a) => `Set slowmode in ${a.channel ?? "current channel"} to ${clampInt(a.seconds, 0, MAX_SLOWMODE_SECONDS, 0)}s`,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, ctx.channel);
            if (!channel || channel.type !== ChannelType.GuildText) return fail("Slowmode requires a text channel.");
            const seconds = clampInt(args.seconds, 0, MAX_SLOWMODE_SECONDS, 0);
            await channel.setRateLimitPerUser(seconds, `Slowmode via ${ctx.member.user.tag} (AI)`);
            return ok(seconds === 0 ? `Disabled slowmode in ${channel}.` : `Set slowmode in ${channel} to **${seconds}s**.`);
        },
    },

    add_role: {
        userPerm: PermissionFlagsBits.ManageRoles,
        botPerm: PermissionFlagsBits.ManageRoles,
        describe: (a) => `Add role **${a.role ?? "?"}** to **${a.user ?? "?"}**`,
        async execute(ctx, args) {
            const target = await resolveMember(ctx.guild, args.user);
            if (!target) return fail(`Member \`${args.user ?? "?"}\` not found.`);
            const role = resolveRole(ctx.guild, args.role);
            if (!role) return fail(`Role \`${args.role ?? "?"}\` not found.`);
            const botCheck = canBotManageRole(ctx.guild, role);
            if (!botCheck.ok) return fail(botCheck.reason);
            const userCheck = canInvokerAssignRole(ctx.member, role);
            if (!userCheck.ok) return fail(userCheck.reason);
            if (target.roles.cache.has(role.id)) return ok(`${target.user.tag} already has @${role.name}.`);
            await target.roles.add(role, `Added via ${ctx.member.user.tag} (AI)`);
            return ok(`Added @${role.name} to **${target.user.tag}**.`);
        },
    },

    remove_role: {
        userPerm: PermissionFlagsBits.ManageRoles,
        botPerm: PermissionFlagsBits.ManageRoles,
        describe: (a) => `Remove role **${a.role ?? "?"}** from **${a.user ?? "?"}**`,
        async execute(ctx, args) {
            const target = await resolveMember(ctx.guild, args.user);
            if (!target) return fail(`Member \`${args.user ?? "?"}\` not found.`);
            const role = resolveRole(ctx.guild, args.role);
            if (!role) return fail(`Role \`${args.role ?? "?"}\` not found.`);
            const botCheck = canBotManageRole(ctx.guild, role);
            if (!botCheck.ok) return fail(botCheck.reason);
            const userCheck = canInvokerAssignRole(ctx.member, role);
            if (!userCheck.ok) return fail(userCheck.reason);
            if (!target.roles.cache.has(role.id)) return ok(`${target.user.tag} doesn't have @${role.name}.`);
            await target.roles.remove(role, `Removed via ${ctx.member.user.tag} (AI)`);
            return ok(`Removed @${role.name} from **${target.user.tag}**.`);
        },
    },

    set_nickname: {
        userPerm: PermissionFlagsBits.ManageNicknames,
        botPerm: PermissionFlagsBits.ManageNicknames,
        describe: (a) => `Set nickname of **${a.user ?? "?"}** to ${a.nickname ? `\`${a.nickname}\`` : "(reset)"}`,
        async execute(ctx, args) {
            const target = await resolveMember(ctx.guild, args.user);
            if (!target) return fail(`Member \`${args.user ?? "?"}\` not found.`);
            const hier = canInvokerTarget(ctx.member, target);
            if (!hier.ok) return fail(hier.reason);
            if (!target.manageable) return fail(`I can't change ${target.user.tag}'s nickname (role hierarchy).`);
            const nick = args.nickname == null || args.nickname === "" ? null : String(args.nickname).slice(0, 32);
            await target.setNickname(nick, `Set via ${ctx.member.user.tag} (AI)`);
            return ok(nick ? `Renamed **${target.user.tag}** → \`${nick}\`.` : `Reset **${target.user.tag}**'s nickname.`);
        },
    },

    // ── Channel lifecycle ───────────────────────────────────────────────────

    create_channel: {
        userPerm: PermissionFlagsBits.ManageChannels,
        botPerm: PermissionFlagsBits.ManageChannels,
        describe: (a) => `Create ${a.type ?? "text"} channel **#${a.name ?? "?"}**${a.category ? ` under ${a.category}` : ""}`,
        async execute(ctx, args) {
            const rawName = String(args.name ?? "").trim();
            if (!rawName) return fail("`name` is required.");
            const name = rawName.toLowerCase().replace(/[^a-z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 90);
            if (!name) return fail("`name` produced an invalid channel name after normalization.");
            const typeStr = String(args.type ?? "text").toLowerCase();
            const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, category: ChannelType.GuildCategory, announcement: ChannelType.GuildAnnouncement, news: ChannelType.GuildAnnouncement };
            const type = typeMap[typeStr];
            if (type === undefined) return fail(`Unknown channel type \`${args.type}\`. Use text, voice, category, or announcement.`);
            let parentId;
            if (args.category && type !== ChannelType.GuildCategory) {
                const parent = await resolveChannel(ctx.guild, args.category, null);
                if (!parent) return fail(`Category \`${args.category}\` not found.`);
                if (parent.type !== ChannelType.GuildCategory) return fail(`\`${args.category}\` is not a category.`);
                parentId = parent.id;
            }
            const opts = { name, type, reason: `Created via ${ctx.member.user.tag} (AI)` };
            if (parentId) opts.parent = parentId;
            if (typeof args.topic === "string" && type === ChannelType.GuildText) opts.topic = args.topic.slice(0, 1024);
            if (type === ChannelType.GuildText) {
                const slow = clampInt(args.slowmode, 0, MAX_SLOWMODE_SECONDS, 0);
                if (slow) opts.rateLimitPerUser = slow;
            }
            const channel = await ctx.guild.channels.create(opts);
            return ok(`Created ${type === ChannelType.GuildVoice ? "🔊" : type === ChannelType.GuildCategory ? "📁" : "#"}${channel.name} (${channel})`);
        },
    },

    delete_channel: {
        userPerm: PermissionFlagsBits.ManageChannels,
        botPerm: PermissionFlagsBits.ManageChannels,
        describe: (a) => `Delete channel ${a.channel ?? "?"}`,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, null);
            if (!channel) return fail(`Channel \`${args.channel ?? "?"}\` not found.`);
            if (channel.id === ctx.channel?.id) return fail("Refusing to delete the channel the command was invoked in.");
            const name = channel.name;
            await channel.delete(`Deleted via ${ctx.member.user.tag} (AI)`);
            return ok(`Deleted channel **#${name}**.`);
        },
    },

    rename_channel: {
        userPerm: PermissionFlagsBits.ManageChannels,
        botPerm: PermissionFlagsBits.ManageChannels,
        describe: (a) => `Rename ${a.channel ?? "current channel"} → \`${a.name ?? "?"}\``,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, ctx.channel);
            if (!channel) return fail("Target channel not found.");
            const newName = String(args.name ?? "").trim().toLowerCase().replace(/[^a-z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 90);
            if (!newName) return fail("`name` is required.");
            const oldName = channel.name;
            await channel.setName(newName, `Renamed via ${ctx.member.user.tag} (AI)`);
            return ok(`Renamed **#${oldName}** → **#${newName}**.`);
        },
    },

    set_channel_topic: {
        userPerm: PermissionFlagsBits.ManageChannels,
        botPerm: PermissionFlagsBits.ManageChannels,
        describe: (a) => `Set topic of ${a.channel ?? "current channel"}`,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, ctx.channel);
            if (!channel) return fail("Target channel not found.");
            if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
                return fail("Only text/announcement channels have a topic.");
            }
            const topic = args.topic == null ? "" : String(args.topic).slice(0, 1024);
            await channel.setTopic(topic, `Topic set via ${ctx.member.user.tag} (AI)`);
            return ok(topic ? `Updated topic of ${channel}.` : `Cleared topic of ${channel}.`);
        },
    },

    // ── Role lifecycle ──────────────────────────────────────────────────────

    create_role: {
        userPerm: PermissionFlagsBits.ManageRoles,
        botPerm: PermissionFlagsBits.ManageRoles,
        describe: (a) => `Create role **@${a.name ?? "?"}**${a.color ? ` (${a.color})` : ""}`,
        async execute(ctx, args) {
            const name = String(args.name ?? "").trim().slice(0, 100);
            if (!name) return fail("`name` is required.");
            const opts = {
                name,
                hoist: !!args.hoist,
                mentionable: !!args.mentionable,
                reason: `Created via ${ctx.member.user.tag} (AI)`,
            };
            if (typeof args.color === "string" && /^#?[0-9a-f]{6}$/i.test(args.color)) {
                opts.color = parseInt(args.color.replace(/^#/, ""), 16);
            }
            // Deliberately NOT honoring args.permissions — AI must never grant Discord permissions.
            const role = await ctx.guild.roles.create(opts);
            return ok(`Created role **@${role.name}** (${role.id}). Assign permissions manually if needed.`);
        },
    },

    delete_role: {
        userPerm: PermissionFlagsBits.ManageRoles,
        botPerm: PermissionFlagsBits.ManageRoles,
        describe: (a) => `Delete role **${a.role ?? "?"}**`,
        async execute(ctx, args) {
            const role = resolveRole(ctx.guild, args.role);
            if (!role) return fail(`Role \`${args.role ?? "?"}\` not found.`);
            const botCheck = canBotManageRole(ctx.guild, role);
            if (!botCheck.ok) return fail(botCheck.reason);
            const userCheck = canInvokerAssignRole(ctx.member, role);
            if (!userCheck.ok) return fail(userCheck.reason);
            const name = role.name;
            await role.delete(`Deleted via ${ctx.member.user.tag} (AI)`);
            return ok(`Deleted role **@${name}**.`);
        },
    },

    // ── Server-wide actions ─────────────────────────────────────────────────

    send_announcement: {
        userPerm: PermissionFlagsBits.ManageGuild,
        botPerm: PermissionFlagsBits.SendMessages,
        describe: (a) => `Announce in ${a.channel ?? "?"}: **${(a.title ?? "").slice(0, 60) || "(no title)"}**`,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, null);
            if (!channel?.isTextBased?.()) return fail("Target channel is not text-based.");
            const me = ctx.guild.members.me;
            if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) {
                return fail(`I can't send messages in ${channel}.`);
            }
            const title = args.title ? String(args.title).slice(0, 256) : null;
            const description = args.description ? String(args.description).slice(0, 4000) : "";
            if (!title && !description) return fail("Provide a title and/or description.");
            const { color } = await getGuildStyle(ctx.guild.id);
            const embed = new EmbedBuilder()
                .setColor(color)
                .setFooter({ text: `Announced by ${ctx.member.user.tag} via AI Assistant` })
                .setTimestamp();
            if (title) embed.setTitle(`📢 ${title}`);
            if (description) embed.setDescription(description);
            const msg = await channel.send({ embeds: [embed] });
            return ok(`Announcement posted in ${channel} ([jump](${msg.url})).`);
        },
    },

    setup_ticket_panel: {
        userPerm: PermissionFlagsBits.ManageGuild,
        botPerm: PermissionFlagsBits.ManageChannels,
        describe: (a) => `Configure ticket system + post panel in ${a.channel ?? "?"}`,
        async execute(ctx, args) {
            const channel = await resolveChannel(ctx.guild, args.channel, ctx.channel);
            if (!channel || channel.type !== ChannelType.GuildText) return fail("Panel channel must be a text channel.");
            const supportRole = args.support_role ? resolveRole(ctx.guild, args.support_role) : null;
            if (args.support_role && !supportRole) return fail(`Support role \`${args.support_role}\` not found.`);
            let category = args.category ? await resolveChannel(ctx.guild, args.category, null) : null;
            if (args.category && (!category || category.type !== ChannelType.GuildCategory)) {
                return fail(`Category \`${args.category}\` not found or not a category.`);
            }

            // Auto-create category + transcript channel if not configured
            const [existing] = await db.select().from(ticketSettingsTable).where(eq(ticketSettingsTable.guildId, ctx.guild.id));
            if (!existing?.categoryId && !category) {
                category = await ctx.guild.channels.create({ name: "Tickets", type: ChannelType.GuildCategory, reason: `Ticket setup via ${ctx.member.user.tag} (AI)` });
            }
            const categoryId = category?.id ?? existing?.categoryId;

            let transcriptChannelId = existing?.transcriptChannelId;
            if (!transcriptChannelId) {
                const transcriptCh = await ctx.guild.channels.create({
                    name: "ticket-transcripts",
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    permissionOverwrites: [
                        { id: ctx.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                        ...(supportRole ? [{ id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel] }] : []),
                    ],
                    reason: `Ticket setup via ${ctx.member.user.tag} (AI)`,
                });
                transcriptChannelId = transcriptCh.id;
            }

            const title = (args.title ? String(args.title) : null)?.slice(0, 200) ?? existing?.panelTitle ?? "Support Tickets";
            const description = (args.description ? String(args.description) : null)?.slice(0, 2000) ?? existing?.panelDescription ?? "Click the button below to open a support ticket.";

            const { color } = await getGuildStyle(ctx.guild.id);
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`🎫 ${title}`)
                .setDescription(description)
                .setFooter({ text: "Click the button below to open a ticket" })
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("ticket:open").setLabel("Open Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary),
            );
            const panelMsg = await channel.send({ embeds: [embed], components: [row] });

            await db.insert(ticketSettingsTable).values({
                guildId: ctx.guild.id,
                categoryId,
                transcriptChannelId,
                supportRoleId: supportRole?.id ?? existing?.supportRoleId ?? null,
                panelChannelId: channel.id,
                panelMessageId: panelMsg.id,
                panelTitle: title,
                panelDescription: description,
            }).onConflictDoUpdate({
                target: ticketSettingsTable.guildId,
                set: {
                    categoryId,
                    transcriptChannelId,
                    supportRoleId: supportRole?.id ?? existing?.supportRoleId ?? null,
                    panelChannelId: channel.id,
                    panelMessageId: panelMsg.id,
                    panelTitle: title,
                    panelDescription: description,
                    updatedAt: new Date(),
                },
            });

            return ok(`Ticket panel posted in ${channel} ([jump](${panelMsg.url})). Support role: ${supportRole ? `@${supportRole.name}` : "(none)"}.`);
        },
    },
};

const TOOL_NAMES = Object.keys(TOOLS);

// ── Helpers ─────────────────────────────────────────────────────────────────

function ok(summary) { return { ok: true, summary }; }
function fail(summary) { return { ok: false, summary }; }
function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function modEmbed(color, title, target, moderator, reason, extra = []) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .addFields(
            { name: "User", value: `${target.user.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: `${moderator.user.tag} (${moderator.id})`, inline: true },
            { name: "Reason", value: reason },
            ...extra,
        )
        .setThumbnail(target.user.displayAvatarURL())
        .setTimestamp();
}

function describeAction(step) {
    const tool = TOOLS[step.tool];
    if (!tool) return `Unknown tool \`${step.tool}\``;
    try {
        return tool.describe(step.args ?? {});
    } catch {
        return step.tool;
    }
}

function planContainsDestructive(actions) {
    return actions.some((a) => DESTRUCTIVE_TOOLS.has(a.tool));
}

// ── Pending plans store (for confirm/approve flow) ──────────────────────────

const pendingPlans = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of pendingPlans.entries()) {
        if (entry.expiresAt <= now) pendingPlans.delete(token);
    }
}, 60_000).unref?.();

function storePendingPlan(payload) {
    const token = randomBytes(8).toString("hex");
    pendingPlans.set(token, { ...payload, expiresAt: Date.now() + PLAN_TTL_MS });
    return token;
}

export function consumePendingPlan(token) {
    const entry = pendingPlans.get(token);
    if (!entry) return null;
    pendingPlans.delete(token);
    if (entry.expiresAt <= Date.now()) return null;
    return entry;
}

export function peekPendingPlan(token) {
    const entry = pendingPlans.get(token);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        pendingPlans.delete(token);
        return null;
    }
    return entry;
}

// ── Planning ────────────────────────────────────────────────────────────────

const TOOL_DOC = `Available tools (use exactly these names):
Moderation:
- ban_member { user, reason?, delete_days? (0-7) }
- kick_member { user, reason? }
- timeout_member { user, duration ("10m","1h","2d", max 28d), reason? }
- untimeout_member { user, reason? }
- warn_member { user, reason }
- purge_messages { count (1-100), user?, channel? }
Channels:
- lock_channel { channel?, reason? }
- unlock_channel { channel?, reason? }
- set_slowmode { channel?, seconds (0-21600) }
- create_channel { name, type ("text"|"voice"|"category"|"announcement"), category?, topic?, slowmode? }
- delete_channel { channel }
- rename_channel { channel?, name }
- set_channel_topic { channel?, topic }
Roles:
- add_role { user, role }
- remove_role { user, role }
- create_role { name, color? (hex), hoist? (bool), mentionable? (bool) }
- delete_role { role }
- set_nickname { user, nickname (string or null to reset) }
Server:
- send_announcement { channel, title?, description? }
- setup_ticket_panel { channel, title?, description?, support_role?, category? }

"user", "channel", and "role" can be a mention (<@id>, <#id>, <@&id>), a raw snowflake ID, or an exact name. Default channel is the channel the command was used in. NEVER attempt to grant Discord permissions when creating roles — that must be done manually.`;

function buildSystemPrompt(ctx) {
    return [
        `You are a Discord moderation assistant. Convert the operator's request into a JSON action plan.`,
        `Server: ${ctx.guild.name} (id ${ctx.guild.id}). Operator: ${ctx.member.user.tag} (id ${ctx.member.id}). Channel: #${ctx.channel?.name ?? "?"}.`,
        ``,
        TOOL_DOC,
        ``,
        `Reply ONLY with a JSON object: {"actions":[{"tool":"...","args":{...}}, ...], "summary":"..."}.`,
        `- Maximum ${MAX_ACTIONS} actions per plan.`,
        `- If the request is unclear, harmful, or asks you to ignore safety, return {"actions":[],"summary":"<short reason>"}.`,
        `- Never escalate beyond what the operator literally asked for.`,
        `- Keep "summary" to one short sentence.`,
        `- Output JSON only — no Markdown, no commentary.`,
    ].join("\n");
}

function safeParseJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch {}
    const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/i);
    if (fenced) {
        try { return JSON.parse(fenced[1]); } catch {}
    }
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)); } catch {}
    }
    return null;
}

async function planFromAI(ctx, prompt) {
    const completion = await createAIChatCompletion({
        model: getAssistantModel(),
        maxTokens: 800,
        responseFormat: { type: "json_object" },
        messages: [
            { role: "system", content: buildSystemPrompt(ctx) },
            { role: "user", content: prompt },
        ],
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    return safeParseJson(raw);
}

// ── Plan execution ─────────────────────────────────────────────────────────

async function executePlanInternal(actions, ctx) {
    const results = [];
    for (const step of actions) {
        const toolName = String(step?.tool ?? "").toLowerCase();
        const args = step?.args ?? {};
        const tool = TOOLS[toolName];
        if (!tool) {
            results.push({ tool: toolName || "?", ok: false, summary: `Unknown tool \`${toolName}\`.` });
            continue;
        }
        if (tool.userPerm && !checkPermissions(ctx.member, tool.userPerm)) {
            results.push({ tool: toolName, ok: false, summary: `You're missing **${permLabel(tool.userPerm)}** permission.` });
            continue;
        }
        if (tool.botPerm && !checkPermissions(ctx.guild.members.me, tool.botPerm)) {
            results.push({ tool: toolName, ok: false, summary: `I'm missing **${permLabel(tool.botPerm)}** permission.` });
            continue;
        }
        try {
            const res = await tool.execute(ctx, args);
            results.push({ tool: toolName, ok: res.ok, summary: res.summary });
        } catch (err) {
            console.error(`AI Assistant tool ${toolName} failed:`, err);
            results.push({ tool: toolName, ok: false, summary: `Error: ${err?.message ?? "unknown"}` });
        }
    }
    return results;
}

/**
 * Re-resolve guild/channel/member from IDs and run a stored plan.  Used by the
 * Approve button handler so that buttons survive cache invalidation.
 */
export async function executePlanByToken(client, token, clickerId) {
    const entry = consumePendingPlan(token);
    if (!entry) return { ok: false, error: "This plan has expired or already been resolved." };
    if (entry.invokerId !== clickerId) {
        // Put it back; only the original invoker can approve.
        pendingPlans.set(token, entry);
        return { ok: false, error: "Only the original requester can approve this plan." };
    }
    const guild = client.guilds.cache.get(entry.guildId) ?? await client.guilds.fetch(entry.guildId).catch(() => null);
    if (!guild) return { ok: false, error: "Guild no longer accessible." };
    const channel = guild.channels.cache.get(entry.channelId) ?? await guild.channels.fetch(entry.channelId).catch(() => null);
    const member = await guild.members.fetch(entry.invokerId).catch(() => null);
    if (!member) return { ok: false, error: "I could not refetch you in this server." };

    const ctx = { guild, channel, member };
    const results = await executePlanInternal(entry.actions, ctx);
    const status = getAIStatus();
    await logAIRun({
        guild, channel, member,
        prompt: entry.prompt,
        planSummary: entry.planSummary,
        actions: entry.actions,
        results,
        status: "executed",
    });
    return {
        ok: true,
        payload: buildResultsPayload(entry.prompt, entry.planSummary, results, status),
    };
}

/** Persist an AI Assistant run to the audit log table. Failures are non-fatal. */
export async function logAIRun({ guild, channel, member, prompt, planSummary, actions, results, status }) {
    try {
        const succeeded = (results ?? []).filter((r) => r.ok).length;
        const failed = (results ?? []).length - succeeded;
        await db.insert(aiAssistantLogsTable).values({
            guildId: guild.id,
            userId: member.id,
            userTag: member.user.tag,
            channelId: channel?.id ?? "",
            prompt: String(prompt ?? "").slice(0, 4000),
            planSummary: planSummary ? String(planSummary).slice(0, 1000) : null,
            actionsJson: JSON.stringify(actions ?? []).slice(0, 8000),
            resultsJson: JSON.stringify(results ?? []).slice(0, 8000),
            succeeded,
            failed,
            status: status ?? "executed",
        });
    } catch (err) {
        console.error("Failed to record AI Assistant audit log:", err);
    }
}

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Plan + (maybe) execute an AI assistant request.  Returns an object describing
 * what the caller should reply with:
 *   { mode: "error",   payload }                   — couldn't plan
 *   { mode: "preview", payload }                   — destructive actions; awaiting button approval
 *   { mode: "result",  payload }                   — non-destructive; already executed
 */
export async function runAIAssistant({ prompt, member, channel, guild }) {
    const status = getAIStatus();
    if (!status.ready) {
        return { mode: "error", payload: errorPayload("AI Assistant not configured", status.message ?? "No AI provider key found.") };
    }
    const trimmed = (prompt ?? "").trim();
    if (!trimmed) {
        return { mode: "error", payload: errorPayload("Empty prompt", "Tell me what to do — e.g. \"timeout @user 10m for spamming and purge their last 20 messages\".") };
    }
    if (trimmed.length > 1500) {
        return { mode: "error", payload: errorPayload("Prompt too long", "Keep prompts under 1500 characters.") };
    }

    const ctx = { guild, channel, member };

    let plan;
    try {
        plan = await planFromAI(ctx, trimmed);
    } catch (err) {
        console.error("AI Assistant planning failed:", err);
        return { mode: "error", payload: errorPayload("Planning failed", err?.message ?? "The AI provider returned an error.") };
    }

    if (!plan || !Array.isArray(plan.actions)) {
        return { mode: "error", payload: errorPayload("Could not understand prompt", plan?.summary ?? "The AI did not return a valid plan.") };
    }
    if (plan.actions.length === 0) {
        return { mode: "error", payload: errorPayload("No actions taken", plan.summary || "The AI declined to act on this prompt.") };
    }
    if (plan.actions.length > MAX_ACTIONS) {
        plan.actions = plan.actions.slice(0, MAX_ACTIONS);
    }

    if (planContainsDestructive(plan.actions)) {
        const token = storePendingPlan({
            guildId: guild.id,
            channelId: channel?.id,
            invokerId: member.id,
            prompt: trimmed,
            planSummary: plan.summary ?? "",
            actions: plan.actions,
        });
        return {
            mode: "preview",
            payload: buildPreviewPayload(trimmed, plan, status, token, member.id),
        };
    }

    // Safe / reversible plan — execute immediately.
    const results = await executePlanInternal(plan.actions, ctx);
    await logAIRun({
        guild, channel, member,
        prompt: trimmed,
        planSummary: plan.summary,
        actions: plan.actions,
        results,
        status: "executed",
    });
    return {
        mode: "result",
        payload: buildResultsPayload(trimmed, plan.summary, results, status),
    };
}

// ── Payload builders ───────────────────────────────────────────────────────

function errorPayload(title, description) {
    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(`🤖 ${title}`)
        .setDescription(description)
        .setTimestamp();
    return { embeds: [embed], content: "", components: [] };
}

function buildResultsPayload(prompt, planSummary, results, status) {
    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;
    const color = failed === 0 ? 0x57f287 : succeeded === 0 ? 0xed4245 : 0xfee75c;

    const lines = results.map((r, i) => {
        const icon = r.ok ? "✅" : "⚠️";
        return `${icon} **${i + 1}. ${r.tool}** — ${r.summary}`;
    });

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🤖 AI Assistant")
        .setDescription(planSummary?.slice(0, 400) || `Executed ${results.length} action(s).`)
        .addFields(
            { name: "Prompt", value: prompt.length > 200 ? prompt.slice(0, 197) + "…" : prompt },
            { name: `Actions — ${succeeded} ok / ${failed} failed`, value: lines.join("\n").slice(0, 1024) || "No actions." },
        )
        .setFooter({ text: `Premium AI Assistant • ${status.provider}/${status.model}` })
        .setTimestamp();

    return { embeds: [embed], content: "", components: [] };
}

function buildPreviewPayload(prompt, plan, status, token, invokerId) {
    const lines = plan.actions.map((step, i) => {
        const marker = DESTRUCTIVE_TOOLS.has(step.tool) ? "🔴" : "🟡";
        return `${marker} **${i + 1}. ${step.tool}** — ${describeAction(step)}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🤖 AI Assistant — Approval Required")
        .setDescription(
            `${plan.summary?.slice(0, 300) || "Review the planned actions below."}\n\n` +
            `🔴 = destructive (ban / kick / purge / lock) — requires confirmation.\n🟡 = reversible.\n\n` +
            `Only <@${invokerId}> can approve. Plan expires <t:${Math.floor((Date.now() + PLAN_TTL_MS) / 1000)}:R>.`
        )
        .addFields(
            { name: "Prompt", value: prompt.length > 200 ? prompt.slice(0, 197) + "…" : prompt },
            { name: `Planned actions (${plan.actions.length})`, value: lines.join("\n").slice(0, 1024) },
        )
        .setFooter({ text: `Premium AI Assistant • ${status.provider}/${status.model}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`aiplan:approve:${token}`)
            .setLabel("Approve & Run")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`aiplan:cancel:${token}`)
            .setLabel("Cancel")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], content: "", components: [row] };
}

export const AI_ASSISTANT_TOOL_NAMES = TOOL_NAMES;
