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
import { eq, and } from "drizzle-orm";

/**
 * Send an AutoMod log embed to the configured automod log channel.
 * Silently swallows errors — automod actions should never fail because of logging.
 */
async function sendAutomodLog(guild, automod, embed) {
    try {
        if (!automod?.logChannelId) return;
        const channel = guild.channels.cache.get(automod.logChannelId)
            ?? await guild.channels.fetch(automod.logChannelId).catch(() => null);
        if (!channel?.isTextBased()) return;
        await channel.send({ embeds: [embed] });
    } catch {
        // Never let logging break automod
    }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const prefixCommands = new Map();
const spamTracker = new Map();

// Clean up stale spam tracker entries every 30 seconds to prevent memory leak
setInterval(() => {
    const cutoff = Date.now() - 30_000;
    for (const [key, times] of spamTracker.entries()) {
        const recent = times.filter((t) => t > cutoff);
        if (recent.length === 0) {
            spamTracker.delete(key);
        } else {
            spamTracker.set(key, recent);
        }
    }
}, 30_000);

async function loadPrefixCommands() {
    const dir = resolve(__dirname, "../prefixCommands");
    const files = readdirSync(dir).filter(
        (f) => (f.endsWith(".ts") || f.endsWith(".js")) && f !== "index.ts" && f !== "index.js"
    );
    for (const file of files) {
        const mod = await import(pathToFileURL(resolve(dir, file)).href);
        if (mod.command?.name) {
            prefixCommands.set(mod.command.name, mod.command);
        }
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

    // Resolve prefix early — needed for AFK fix and routing
    const prefix = await getPrefix(guildId);
    const msgLower = message.content.toLowerCase().trim();
    const isAfkCommand = msgLower.startsWith(prefix + "afk") || msgLower === "afk";

    // ── AFK checks ───────────────────────────────────────────────────────────
    const [afkEntry] = await db
        .select()
        .from(afkUsersTable)
        .where(and(eq(afkUsersTable.userId, message.author.id), eq(afkUsersTable.guildId, guildId)));

    // Only clear AFK if not running %afk to update/re-set it (avoids "welcome back" + "you are now AFK" spam)
    if (afkEntry && !isAfkCommand) {
        await db
            .delete(afkUsersTable)
            .where(and(eq(afkUsersTable.userId, message.author.id), eq(afkUsersTable.guildId, guildId)));
        await message.reply("👋 Welcome back! Your AFK status has been removed.").catch(() => {});
    }

    for (const mentioned of message.mentions.users.values()) {
        if (mentioned.bot) continue;
        const [mentionedAfk] = await db
            .select()
            .from(afkUsersTable)
            .where(and(eq(afkUsersTable.userId, mentioned.id), eq(afkUsersTable.guildId, guildId)));
        if (mentionedAfk) {
            const elapsed = Math.floor((Date.now() - mentionedAfk.setAt.getTime()) / 60000);
            await message
                .reply(`💤 **${mentioned.tag}** is AFK: ${mentionedAfk.reason} (${elapsed}m ago)`)
                .catch(() => {});
        }
    }

    // ── AutoMod ──────────────────────────────────────────────────────────────
    const [automod] = await db
        .select()
        .from(automodSettingsTable)
        .where(eq(automodSettingsTable.guildId, guildId));

    if (automod?.enabled) {
        const lowerContent = message.content.toLowerCase();
        const snippet = message.content.length > 200 ? message.content.slice(0, 200) + "…" : message.content;

        if (automod.badWords) {
            const banned = automod.badWords
                .split(",")
                .map((w) => w.trim().toLowerCase())
                .filter(Boolean);
            const matched = banned.find((w) => {
                const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return new RegExp(`\\b${escaped}\\b`).test(lowerContent);
            });
            if (matched) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`⚠️ ${message.author}, that word is not allowed here.`);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
                await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle("🛡️ AutoMod — Banned Word")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                        { name: "Matched Word", value: `\`${matched}\``, inline: true },
                        { name: "Message Preview", value: snippet },
                    )
                    .setTimestamp()
                );
                return;
            }
        }

        if (automod.maxMentions > 0 && message.mentions.users.size >= automod.maxMentions) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`⚠️ ${message.author}, too many mentions!`);
            setTimeout(() => warn.delete().catch(() => {}), 5000);
            await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                .setColor(0xfee75c)
                .setTitle("🛡️ AutoMod — Mention Spam")
                .addFields(
                    { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                    { name: "Mentions", value: `${message.mentions.users.size} (limit: ${automod.maxMentions})`, inline: true },
                    { name: "Message Preview", value: snippet },
                )
                .setTimestamp()
            );
            return;
        }

        if (automod.maxCapsPercent > 0 && message.content.length > 10) {
            const caps = (message.content.match(/[A-Z]/g) ?? []).length;
            const pct = (caps / message.content.replace(/\s/g, "").length) * 100;
            if (pct >= automod.maxCapsPercent) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`⚠️ ${message.author}, too many caps!`);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
                await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                    .setColor(0xfee75c)
                    .setTitle("🛡️ AutoMod — Excessive Caps")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                        { name: "Caps %", value: `${Math.round(pct)}% (limit: ${automod.maxCapsPercent}%)`, inline: true },
                        { name: "Message Preview", value: snippet },
                    )
                    .setTimestamp()
                );
                return;
            }
        }

        if (automod.antiSpamEnabled) {
            const key = `${guildId}:${message.author.id}`;
            const now = Date.now();
            const times = spamTracker.get(key) ?? [];
            const recent = times.filter((t) => now - t < 5000);
            recent.push(now);
            spamTracker.set(key, recent);
            if (recent.length >= 5) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(
                    `⚠️ ${message.author}, slow down! You're sending messages too fast.`
                );
                setTimeout(() => warn.delete().catch(() => {}), 5000);
                await sendAutomodLog(message.guild, automod, new EmbedBuilder()
                    .setColor(0xf47b67)
                    .setTitle("🛡️ AutoMod — Spam Detected")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                        { name: "Messages", value: `${recent.length} in 5 seconds`, inline: true },
                    )
                    .setTimestamp()
                );
                return;
            }
        }
    }

    // ── Sticky message re-post ────────────────────────────────────────────────
    // Run after automod so deleted messages don't bump the sticky
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

    // ── Custom commands fallback (premium) ────────────────────────────────────
    // If no built-in command matched, check this guild's custom commands
    try {
        const { sql: drizzleSql } = await import("drizzle-orm");
        const [custom] = await db.select().from(customCommandsTable)
            .where(and(eq(customCommandsTable.guildId, guildId), eq(customCommandsTable.name, commandName)));
        if (custom) {
            await message.channel.send(custom.response).catch(() => {});
            // Increment use count (fire-and-forget)
            db.update(customCommandsTable)
                .set({ uses: drizzleSql`${customCommandsTable.uses} + 1` })
                .where(eq(customCommandsTable.id, custom.id))
                .catch(() => {});
        }
    } catch {
        // Custom command lookup never blocks the user
    }
}

// ── Sticky message handler ─────────────────────────────────────────────────────
async function handleSticky(message) {
    const [sticky] = await db.select().from(stickyMessagesTable)
        .where(and(
            eq(stickyMessagesTable.guildId, message.guild.id),
            eq(stickyMessagesTable.channelId, message.channel.id),
            eq(stickyMessagesTable.enabled, true),
        ));
    if (!sticky) return;

    // Don't re-post if this message IS the sticky (bot's own sticky message)
    if (message.id === sticky.lastMessageId) return;

    // Delete old sticky message
    if (sticky.lastMessageId) {
        await message.channel.messages.delete(sticky.lastMessageId).catch(() => {});
    }

    // Post new sticky
    const newMsg = await message.channel.send({ content: `📌 **Sticky:**\n${sticky.content}` }).catch(() => null);
    if (newMsg) {
        await db.update(stickyMessagesTable)
            .set({ lastMessageId: newMsg.id })
            .where(and(
                eq(stickyMessagesTable.guildId, message.guild.id),
                eq(stickyMessagesTable.channelId, message.channel.id),
            ));
    }
}

// ── Chat XP with level-up announcement ───────────────────────────────────────
async function handleChatXp(message, guildId) {
    const result = await awardChatXp(guildId, message.author);
    if (!result.awarded || !result.leveledUp) return;

    const { color } = await getGuildStyle(guildId).catch(() => ({ color: 0x5865f2 }));

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🎉 Level Up!")
        .setDescription(
            `Congratulations ${message.author}! You reached **Level ${result.levelInfo.level}** in this server.`
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

    await message.channel.send({ embeds: [embed] }).catch(() => {});
}
