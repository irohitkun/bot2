import { Events, EmbedBuilder } from "discord.js";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { getPrefix, getNoPrefixMode } from "../utils/prefixCache.js";
import { canUseNoPrefix } from "../utils/noPrefixAccess.js";
import { db, afkUsersTable, automodSettingsTable, stickyMessagesTable, customCommandsTable } from "../db/index.js";
import { awardChatXp } from "../utils/community.js";
import { noPrefixBlockedCommandNames } from "../utils/helpCatalog.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { checkCooldown } from "../utils/cooldown.js";
import { eq, and } from "drizzle-orm";

const LINK_REGEX = /https?:\/\/\S+/i;
const INVITE_REGEX = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[\w-]+/i;

async function sendAutomodLog(guild, automod, embed) {
    try {
        if (!automod?.logChannelId) return;
        const channel = guild.channels.cache.get(automod.logChannelId)
            ?? await guild.channels.fetch(automod.logChannelId).catch(() => null);
        if (!channel?.isTextBased()) return;
        await channel.send({ embeds: [embed] });
    } catch {}
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const prefixCommands = new Map();
const spamTracker = new Map();

setInterval(() => {
    const cutoff = Date.now() - 30_000;
    for (const [key, times] of spamTracker.entries()) {
        const recent = times.filter((t) => t > cutoff);
        if (recent.length === 0) spamTracker.delete(key);
        else spamTracker.set(key, recent);
    }
}, 30_000);

async function loadPrefixCommands() {
    const dir = resolve(__dirname, "../prefixCommands");
    const fileList = readdirSync(dir).filter(
        (f) => (f.endsWith(".ts") || f.endsWith(".js")) && f !== "index.ts" && f !== "index.js"
    );
    for (const file of fileList) {
        const mod = await import(pathToFileURL(resolve(dir, file)).href);
        if (mod.command?.name) prefixCommands.set(mod.command.name, mod.command);
    }
    console.log(`Loaded ${prefixCommands.size} prefix commands.`);
}
loadPrefixCommands();

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const prefix = await getPrefix(guildId);
    const msgLower = message.content.toLowerCase().trim();
    const isAfkCommand = msgLower.startsWith(prefix + "afk") || msgLower === "afk";

    // ── AFK checks ───────────────────────────────────────────────────────────
    const [afkEntry] = await db.select().from(afkUsersTable)
        .where(and(eq(afkUsersTable.userId, message.author.id), eq(afkUsersTable.guildId, guildId)));
    if (afkEntry && !isAfkCommand) {
        await db.delete(afkUsersTable).where(and(eq(afkUsersTable.userId, message.author.id), eq(afkUsersTable.guildId, guildId)));
        await message.reply("👋 Welcome back! Your AFK status has been removed.").catch(() => {});
    }
    for (const mentioned of message.mentions.users.values()) {
        if (mentioned.bot) continue;
        const [mentionedAfk] = await db.select().from(afkUsersTable)
            .where(and(eq(afkUsersTable.userId, mentioned.id), eq(afkUsersTable.guildId, guildId)));
        if (mentionedAfk) {
            const elapsed = Math.floor((Date.now() - mentionedAfk.setAt.getTime()) / 60000);
            await message.reply(`💤 **${mentioned.tag}** is AFK: ${mentionedAfk.reason} (${elapsed}m ago)`).catch(() => {});
        }
    }

    // ── AutoMod ──────────────────────────────────────────────────────────────
    const [automod] = await db.select().from(automodSettingsTable).where(eq(automodSettingsTable.guildId, guildId));

    if (automod?.enabled) {
        const lowerContent = message.content.toLowerCase();
        const snippet = message.content.length > 200 ? message.content.slice(0, 200) + "…" : message.content;

        const bypassChannels = automod.bypassChannels
            ? automod.bypassChannels.split(",").map((c) => c.trim()).filter(Boolean) : [];
        const isBypassed = bypassChannels.includes(message.channel.id);

        if (!isBypassed) {
            // Banned words
            if (automod.badWords) {
                const banned = automod.badWords.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
                const matched = banned.find((w) => {
                    try {
                        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                        return new RegExp("\\b" + escaped + "\\b").test(lowerContent);
                    } catch { return lowerContent.includes(w); }
                });
                if (matched) {
                    await message.delete().catch(() => {});
                    const warn = await message.channel.send(`⚠️ ${message.author}, that word is not allowed here.`);
                    setTimeout(() => warn.delete().catch(() => {}), 5000);
                    await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                        .setColor(0xed4245).setTitle("🛡️ AutoMod — Banned Word")
                        .addFields(
                            { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                            { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                            { name: "Matched Word", value: `\`${matched}\``, inline: true },
                            { name: "Message Preview", value: snippet },
                        ).setTimestamp());
                    return;
                }
            }

            // Regex patterns (stored joined by |||)
            if (automod.regexPatterns) {
                const patterns = automod.regexPatterns.split("|||").map((p) => p.trim()).filter(Boolean);
                for (const pattern of patterns) {
                    try {
                        if (new RegExp(pattern, "i").test(message.content)) {
                            await message.delete().catch(() => {});
                            const warn = await message.channel.send(`⚠️ ${message.author}, your message was flagged by the word filter.`);
                            setTimeout(() => warn.delete().catch(() => {}), 5000);
                            await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                                .setColor(0xed4245).setTitle("🛡️ AutoMod — Regex Match")
                                .addFields(
                                    { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                                    { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                                    { name: "Pattern", value: `\`${pattern.slice(0, 100)}\``, inline: true },
                                    { name: "Message Preview", value: snippet },
                                ).setTimestamp());
                            return;
                        }
                    } catch {}
                }
            }

            // Block Discord invites
            if (automod.blockInvites && INVITE_REGEX.test(message.content)) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`⚠️ ${message.author}, Discord invite links are not allowed here.`);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
                await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                    .setColor(0xed4245).setTitle("🛡️ AutoMod — Invite Link Blocked")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                        { name: "Message Preview", value: snippet },
                    ).setTimestamp());
                return;
            }

            // Block all links
            if (automod.blockLinks && LINK_REGEX.test(message.content)) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`⚠️ ${message.author}, links are not allowed here.`);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
                await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                    .setColor(0xed4245).setTitle("🛡️ AutoMod — Link Blocked")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                        { name: "Message Preview", value: snippet },
                    ).setTimestamp());
                return;
            }

            // Mention spam
            if (automod.maxMentions > 0 && message.mentions.users.size >= automod.maxMentions) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`⚠️ ${message.author}, too many mentions!`);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
                await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                    .setColor(0xfee75c).setTitle("🛡️ AutoMod — Mention Spam")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                        { name: "Mentions", value: `${message.mentions.users.size} (limit: ${automod.maxMentions})`, inline: true },
                        { name: "Message Preview", value: snippet },
                    ).setTimestamp());
                return;
            }

            // Caps filter
            if (automod.maxCapsPercent > 0 && message.content.length > 10) {
                const caps = (message.content.match(/[A-Z]/g) ?? []).length;
                const pct = (caps / message.content.replace(/\s/g, "").length) * 100;
                if (pct >= automod.maxCapsPercent) {
                    await message.delete().catch(() => {});
                    const warn = await message.channel.send(`⚠️ ${message.author}, too many caps!`);
                    setTimeout(() => warn.delete().catch(() => {}), 5000);
                    await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                        .setColor(0xfee75c).setTitle("🛡️ AutoMod — Excessive Caps")
                        .addFields(
                            { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                            { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                            { name: "Caps %", value: `${Math.round(pct)}% (limit: ${automod.maxCapsPercent}%)`, inline: true },
                            { name: "Message Preview", value: snippet },
                        ).setTimestamp());
                    return;
                }
            }

            // Anti-spam
            if (automod.antiSpamEnabled) {
                const key = `${guildId}:${message.author.id}`;
                const now = Date.now();
                const times = spamTracker.get(key) ?? [];
                const recent = times.filter((t) => now - t < 5000);
                recent.push(now);
                spamTracker.set(key, recent);
                if (recent.length >= 5) {
                    await message.delete().catch(() => {});
                    const warn = await message.channel.send(`⚠️ ${message.author}, slow down! You're sending messages too fast.`);
                    setTimeout(() => warn.delete().catch(() => {}), 5000);
                    await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                        .setColor(0xf47b67).setTitle("🛡️ AutoMod — Spam Detected")
                        .addFields(
                            { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                            { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                            { name: "Messages", value: `${recent.length} in 5 seconds`, inline: true },
                        ).setTimestamp());
                    return;
                }
            }
        }
    }

    // ── Sticky message re-post ────────────────────────────────────────────────
    handleSticky(message).catch(() => {});

    // ── Prefix / No-prefix routing ────────────────────────────────────────────
    const noPrefixMode = await getNoPrefixMode(guildId);
    let commandName;
    let args;

    if (message.content.startsWith(prefix)) {
        const parts = message.content.slice(prefix.length).trim().split(/\s+/);
        commandName = parts.shift()?.toLowerCase();
        args = parts;
    } else if (noPrefixMode) {
        const parts = message.content.trim().split(/\s+/);
        const potentialCmd = parts[0]?.toLowerCase();
        if (prefixCommands.has(potentialCmd)) {
            if (noPrefixBlockedCommandNames.has(potentialCmd)) {
                await handleChatXp(message, guildId);
                return;
            }
            const allowed = await canUseNoPrefix(message.member);
            if (!allowed) return;
            commandName = parts.shift()?.toLowerCase();
            args = parts;
        } else {
            await handleChatXp(message, guildId);
            return;
        }
    } else {
        await handleChatXp(message, guildId);
        return;
    }

    if (!commandName) return;


    // ── Command alias map ─────────────────────────────────────────────────────
    const COMMAND_ALIASES = {
        // Timeout / mute
        "to":       "mute",       // %to @user 10m — timeout
        "timeout":  "mute",
        "rto":      "unmute",     // %rto @user — remove timeout
        // Unban / unmute (kept, not dangerous)
        "ub":       "unban",
        "um":       "unmute",
        "cw":       "clearwarn",
        // Purge — only 'clear' alias, no single-letter
        "clear":    "purge",
        // Utility shorthands
        "ui":       "userinfo",
        "whois":    "userinfo",
        "si":       "serverinfo",
        "av":       "avatar",
        "pfp":      "avatar",
        "r":        "remind",
        // Channel shorthands — cmd + injected subcommand arg
        "rename":   { cmd: "channel", inject: ["rename"] },
        "topic":    { cmd: "channel", inject: ["topic"] },
        "move":     { cmd: "channel", inject: ["move"] },
        // Role members
        "members":  "inrole",
    };
    const _alias = COMMAND_ALIASES[commandName];
    if (_alias) {
        if (typeof _alias === "string") {
            commandName = _alias;
        } else {
            commandName = _alias.cmd;
            args = [..._alias.inject, ...args];
        }
    }


    // ── Rate limit prefix commands ────────────────────────────────────────────
    const heavyPrefixCmds = new Set(["purge", "massrole", "lockdown", "ai"]);
    const cdMs = heavyPrefixCmds.has(commandName) ? 8000 : 3000;
    const cd = checkCooldown(`prefix:${commandName}:${message.author.id}`, cdMs);
    if (cd.onCooldown) {
        await message.reply(`⏳ Slow down! \`${commandName}\` is on cooldown. Try again in **${(cd.remaining / 1000).toFixed(1)}s**.`).catch(() => {});
        return;
    }

    const command = prefixCommands.get(commandName);
    if (command) {
        try {
            await command.execute(message, args);
        } catch (err) {
            console.error(`Error in prefix command ${prefix}${commandName}:`, err);
            await message.reply("❌ An error occurred while running that command.").catch(() => {});
        }
        return;
    }

    // ── Custom commands fallback ──────────────────────────────────────────────
    try {
        const { sql: drizzleSql } = await import("drizzle-orm");
        const [custom] = await db.select().from(customCommandsTable)
            .where(and(eq(customCommandsTable.guildId, guildId), eq(customCommandsTable.name, commandName)));
        if (custom) {
            await message.channel.send(custom.response).catch(() => {});
            db.update(customCommandsTable)
                .set({ uses: drizzleSql`${customCommandsTable.uses} + 1` })
                .where(eq(customCommandsTable.id, custom.id)).catch(() => {});
        }
    } catch {}
}

async function handleSticky(message) {
    const [sticky] = await db.select().from(stickyMessagesTable)
        .where(and(
            eq(stickyMessagesTable.guildId, message.guild.id),
            eq(stickyMessagesTable.channelId, message.channel.id),
            eq(stickyMessagesTable.enabled, true),
        ));
    if (!sticky || message.id === sticky.lastMessageId) return;
    if (sticky.lastMessageId) await message.channel.messages.delete(sticky.lastMessageId).catch(() => {});
    const newMsg = await message.channel.send({ content: sticky.content }).catch(() => null);
    if (newMsg) {
        await db.update(stickyMessagesTable).set({ lastMessageId: newMsg.id })
            .where(and(
                eq(stickyMessagesTable.guildId, message.guild.id),
                eq(stickyMessagesTable.channelId, message.channel.id),
            ));
    }
}

async function handleChatXp(message, guildId) {
    const result = await awardChatXp(guildId, message.author);
    if (!result.awarded || !result.leveledUp) return;
    const { color } = await getGuildStyle(guildId).catch(() => ({ color: 0x5865f2 }));
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🎉 Level Up!")
        .setDescription(`Congratulations ${message.author}! You reached **Level ${result.levelInfo.level}** in this server.`)
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();
    await message.channel.send({ embeds: [embed] }).catch(() => {});
}
