import { Events, EmbedBuilder } from "discord.js";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { getPrefix, getNoPrefixMode } from "../utils/prefixCache.js";
import { canUseNoPrefix } from "../utils/noPrefixAccess.js";
import { db, afkUsersTable, automodSettingsTable } from "../db/index.js";
import { awardChatXp, incrementMessageCount } from "../utils/community.js";
import { noPrefixBlockedCommandNames } from "../utils/helpCatalog.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { sendModLog } from "../utils/modLog.js";
import { eq, and } from "drizzle-orm";
const __dirname = dirname(fileURLToPath(import.meta.url));
const prefixCommands = new Map();
const spamTracker = new Map();
async function loadPrefixCommands() {
    const dir = resolve(__dirname, "../prefixCommands");
    const files = readdirSync(dir).filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && f !== "index.ts" && f !== "index.js");
    for (const file of files) {
        const mod = await import(pathToFileURL(resolve(dir, file)).href);
        if (mod.command?.name) {
            prefixCommands.set(mod.command.name, mod.command);
            for (const alias of mod.command.aliases ?? []) {
                if (!prefixCommands.has(alias)) prefixCommands.set(alias, mod.command);
            }
        }
    }
    console.log(`Loaded ${prefixCommands.size} prefix commands.`);
}
loadPrefixCommands();
export const name = Events.MessageCreate;
export const once = false;
export async function execute(message) {
    if (message.author.bot)
        return;
    if (!message.guild)
        return;
    const guildId = message.guild.id;
    // Count every non-bot guild message (fire-and-forget, never blocks the handler)
    incrementMessageCount(guildId, message.author).catch(() => {});

    const [afkEntry] = await db.select().from(afkUsersTable).where(and(eq(afkUsersTable.userId, message.author.id), eq(afkUsersTable.guildId, guildId)));
    if (afkEntry) {
        await db.delete(afkUsersTable).where(and(eq(afkUsersTable.userId, message.author.id), eq(afkUsersTable.guildId, guildId)));
        const { color } = await getGuildStyle(guildId);
        try {
            await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(color)
                    .setDescription("👋 Welcome back! Your AFK status has been removed.")],
            });
        } catch { }
    }
    for (const mentioned of message.mentions.users.values()) {
        if (mentioned.bot)
            continue;
        const [mentionedAfk] = await db.select().from(afkUsersTable).where(and(eq(afkUsersTable.userId, mentioned.id), eq(afkUsersTable.guildId, guildId)));
        if (mentionedAfk) {
            const elapsed = Math.floor((Date.now() - mentionedAfk.setAt.getTime()) / 60000);
            const { color } = await getGuildStyle(guildId);
            try {
                await message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(color)
                        .setDescription(`💤 **${mentioned.tag}** is AFK: ${mentionedAfk.reason} *(${elapsed}m ago)*`)],
                });
            } catch { }
        }
    }
    const [automod] = await db.select().from(automodSettingsTable).where(eq(automodSettingsTable.guildId, guildId));
    if (automod?.enabled) {
        const content = message.content.toLowerCase();
        if (automod.badWords) {
            const banned = automod.badWords.split(",").filter(Boolean);
            const matched = banned.find((w) => content.includes(w));
            if (matched) {
                await message.delete().catch(() => { });
                try {
                    const { color } = await getGuildStyle(guildId);
                    const warn = await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor(color)
                            .setDescription(`⚠️ ${message.author}, that word is not allowed here.`)],
                    });
                    setTimeout(() => warn.delete().catch(() => { }), 5000);
                } catch { }
                sendModLog(message.guild, new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle("🚫 Automod — Bad Word")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channelId}>`, inline: true },
                        { name: "Trigger", value: `\`${matched}\``, inline: true },
                        { name: "Message", value: message.content.slice(0, 1024) || "(empty)", inline: false },
                    )
                    .setTimestamp(), "Automod Log").catch(() => {});
                return;
            }
        }
        if (automod.maxMentions > 0 && message.mentions.users.size >= automod.maxMentions) {
            await message.delete().catch(() => { });
            try {
                const { color } = await getGuildStyle(guildId);
                const warn = await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor(color)
                        .setDescription(`⚠️ ${message.author}, too many mentions!`)],
                });
                setTimeout(() => warn.delete().catch(() => { }), 5000);
            } catch { }
            sendModLog(message.guild, new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("🚫 Automod — Mass Mentions")
                .addFields(
                    { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: "Channel", value: `<#${message.channelId}>`, inline: true },
                    { name: "Mentions", value: `${message.mentions.users.size} (limit: ${automod.maxMentions})`, inline: true },
                    { name: "Message", value: message.content.slice(0, 1024) || "(empty)", inline: false },
                )
                .setTimestamp(), "Automod Log").catch(() => {});
            return;
        }
        if (automod.maxCapsPercent > 0 && message.content.length > 10) {
            const caps = (message.content.match(/[A-Z]/g) ?? []).length;
            const pct = Math.round((caps / message.content.replace(/\s/g, "").length) * 100);
            if (pct >= automod.maxCapsPercent) {
                await message.delete().catch(() => { });
                try {
                    const { color } = await getGuildStyle(guildId);
                    const warn = await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor(color)
                            .setDescription(`⚠️ ${message.author}, too many caps!`)],
                    });
                    setTimeout(() => warn.delete().catch(() => { }), 5000);
                } catch { }
                sendModLog(message.guild, new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle("🚫 Automod — Excessive Caps")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channelId}>`, inline: true },
                        { name: "Caps %", value: `${pct}% (limit: ${automod.maxCapsPercent}%)`, inline: true },
                        { name: "Message", value: message.content.slice(0, 1024) || "(empty)", inline: false },
                    )
                    .setTimestamp(), "Automod Log").catch(() => {});
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
                await message.delete().catch(() => { });
                try {
                    const { color } = await getGuildStyle(guildId);
                    const warn = await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor(color)
                            .setDescription(`⚠️ ${message.author}, slow down! You're sending messages too fast.`)],
                    });
                    setTimeout(() => warn.delete().catch(() => { }), 5000);
                } catch { }
                sendModLog(message.guild, new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle("🚫 Automod — Spam Detected")
                    .addFields(
                        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: "Channel", value: `<#${message.channelId}>`, inline: true },
                        { name: "Messages", value: `${recent.length} in 5 seconds`, inline: true },
                    )
                    .setTimestamp(), "Automod Log").catch(() => {});
                return;
            }
        }
    }
    const prefix = await getPrefix(guildId);
    const noPrefixMode = await getNoPrefixMode(guildId);
    let commandName;
    let args;
    if (message.content.startsWith(prefix)) {
        const parts = message.content.slice(prefix.length).trim().split(/\s+/);
        commandName = parts.shift()?.toLowerCase();
        args = parts;
    }
    else if (noPrefixMode) {
        const parts = message.content.trim().split(/\s+/);
        const potentialCmd = parts[0]?.toLowerCase();
        if (prefixCommands.has(potentialCmd)) {
            if (noPrefixBlockedCommandNames.has(potentialCmd)) {
                await awardChatXp(guildId, message.author);
                return;
            }
            const allowed = await canUseNoPrefix(message.member);
            if (!allowed)
                return;
            commandName = parts.shift()?.toLowerCase();
            args = parts;
        }
        else {
            await awardChatXp(guildId, message.author);
            return;
        }
    }
    else {
        await awardChatXp(guildId, message.author);
        return;
    }
    if (!commandName)
        return;
    const command = prefixCommands.get(commandName);
    if (!command)
        return;
    try {
        await command.execute(message, args);
    }
    catch (err) {
        console.error(`Error in prefix command ${prefix}${commandName}:`, err);
        try {
            const { color } = await getGuildStyle(guildId);
            await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(color)
                    .setDescription("❌ An error occurred while running that command.")],
            });
        } catch { }
    }
}
