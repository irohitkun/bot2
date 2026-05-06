import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db, automodSettingsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure automatic moderation")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("status").setDescription("View current automod settings"))
    .addSubcommand((sub) => sub.setName("toggle").setDescription("Enable or disable automod")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true)))
    .addSubcommand((sub) => sub.setName("addword").setDescription("Add a banned word")
        .addStringOption((o) => o.setName("word").setDescription("Word to ban").setRequired(true)))
    .addSubcommand((sub) => sub.setName("removeword").setDescription("Remove a banned word")
        .addStringOption((o) => o.setName("word").setDescription("Word to remove").setRequired(true)))
    .addSubcommand((sub) => sub.setName("setmentions").setDescription("Max mentions per message (0 = disabled)")
        .addIntegerOption((o) => o.setName("max").setDescription("Max mentions (0 to disable)").setMinValue(0).setMaxValue(20).setRequired(true)))
    .addSubcommand((sub) => sub.setName("setcaps").setDescription("Max caps percentage (0 = disabled)")
        .addIntegerOption((o) => o.setName("percent").setDescription("Percent 0–100 (0 to disable)").setMinValue(0).setMaxValue(100).setRequired(true)))
    .addSubcommand((sub) => sub.setName("antispam").setDescription("Toggle anti-spam (5 msgs in 5s)")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true)))
    .addSubcommand((sub) => sub.setName("logchannel").setDescription("Set the automod log channel")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to send automod logs").setRequired(true)))
    .addSubcommand((sub) => sub.setName("blocklinks").setDescription("Block all HTTP/HTTPS links in messages")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable link blocking").setRequired(true)))
    .addSubcommand((sub) => sub.setName("blockinvites").setDescription("Block Discord invite links")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable invite blocking").setRequired(true)))
    .addSubcommand((sub) => sub.setName("bypass").setDescription("Add or remove a channel from the automod bypass list")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to toggle bypass for").setRequired(true))
        .addStringOption((o) => o.setName("action").setDescription("Add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" }, { name: "remove", value: "remove" }
        )));

export async function execute(interaction) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const { color } = await getGuildStyle(guildId);

    // Get or create settings row
    let [automod] = await db.select().from(automodSettingsTable).where(eq(automodSettingsTable.guildId, guildId));
    if (!automod) {
        await db.insert(automodSettingsTable).values({ guildId }).onConflictDoNothing();
        [automod] = await db.select().from(automodSettingsTable).where(eq(automodSettingsTable.guildId, guildId));
    }

    async function save(set) {
        await db.update(automodSettingsTable).set({ ...set, updatedAt: new Date() }).where(eq(automodSettingsTable.guildId, guildId));
    }

    if (sub === "status") {
        const words = automod.badWords ? automod.badWords.split(",").filter(Boolean) : [];
        const bypass = automod.bypassChannels ? automod.bypassChannels.split(",").filter(Boolean) : [];
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle("🛡️ AutoMod Settings")
            .addFields(
                { name: "Status", value: automod.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
                { name: "Anti-Spam", value: automod.antiSpamEnabled ? "✅ On" : "❌ Off", inline: true },
                { name: "Block Links", value: automod.blockLinks ? "✅ On" : "❌ Off", inline: true },
                { name: "Block Invites", value: automod.blockInvites ? "✅ On" : "❌ Off", inline: true },
                { name: "Max Mentions", value: automod.maxMentions > 0 ? `${automod.maxMentions}` : "Off", inline: true },
                { name: "Max Caps %", value: automod.maxCapsPercent > 0 ? `${automod.maxCapsPercent}%` : "Off", inline: true },
                { name: "Banned Words", value: words.length > 0 ? words.map((w) => `\`${w}\``).join(", ") : "None", inline: false },
                { name: "Bypass Channels", value: bypass.length > 0 ? bypass.map((id) => `<#${id}>`).join(", ") : "None", inline: false },
                { name: "Log Channel", value: automod.logChannelId ? `<#${automod.logChannelId}>` : "Not set", inline: true },
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled");
        await save({ enabled });
        return interaction.reply({ content: `✅ AutoMod is now **${enabled ? "enabled" : "disabled"}**.` });
    }

    if (sub === "addword") {
        const word = interaction.options.getString("word").toLowerCase().trim();
        const existing = automod.badWords ? automod.badWords.split(",").filter(Boolean) : [];
        if (existing.includes(word)) return interaction.reply({ content: `ℹ️ \`${word}\` is already in the banned words list.`, flags: 64 });
        existing.push(word);
        await save({ badWords: existing.join(",") });
        return interaction.reply({ content: `✅ \`${word}\` added to banned words.`, flags: 64 });
    }

    if (sub === "removeword") {
        const word = interaction.options.getString("word").toLowerCase().trim();
        const existing = automod.badWords ? automod.badWords.split(",").filter(Boolean) : [];
        const filtered = existing.filter((w) => w !== word);
        if (filtered.length === existing.length) return interaction.reply({ content: `ℹ️ \`${word}\` was not in the list.`, flags: 64 });
        await save({ badWords: filtered.join(",") });
        return interaction.reply({ content: `✅ \`${word}\` removed from banned words.`, flags: 64 });
    }

    if (sub === "setmentions") {
        const max = interaction.options.getInteger("max");
        await save({ maxMentions: max });
        return interaction.reply({ content: `✅ Max mentions set to **${max === 0 ? "disabled" : max}**.`, flags: 64 });
    }

    if (sub === "setcaps") {
        const percent = interaction.options.getInteger("percent");
        await save({ maxCapsPercent: percent });
        return interaction.reply({ content: `✅ Caps filter set to **${percent === 0 ? "disabled" : percent + "%"}**.`, flags: 64 });
    }

    if (sub === "antispam") {
        const enabled = interaction.options.getBoolean("enabled");
        await save({ antiSpamEnabled: enabled });
        return interaction.reply({ content: `✅ Anti-spam is now **${enabled ? "enabled" : "disabled"}**.`, flags: 64 });
    }

    if (sub === "logchannel") {
        const channel = interaction.options.getChannel("channel");
        await save({ logChannelId: channel.id });
        return interaction.reply({ content: `✅ Automod logs will be sent to <#${channel.id}>.`, flags: 64 });
    }

    if (sub === "blocklinks") {
        const enabled = interaction.options.getBoolean("enabled");
        await save({ blockLinks: enabled });
        return interaction.reply({ content: `✅ Link blocking is now **${enabled ? "enabled" : "disabled"}**.`, flags: 64 });
    }

    if (sub === "blockinvites") {
        const enabled = interaction.options.getBoolean("enabled");
        await save({ blockInvites: enabled });
        return interaction.reply({ content: `✅ Invite blocking is now **${enabled ? "enabled" : "disabled"}**.`, flags: 64 });
    }

    if (sub === "bypass") {
        const channel = interaction.options.getChannel("channel");
        const action = interaction.options.getString("action");
        const existing = automod.bypassChannels ? automod.bypassChannels.split(",").filter(Boolean) : [];
        if (action === "add") {
            if (existing.includes(channel.id)) return interaction.reply({ content: `ℹ️ <#${channel.id}> is already in the bypass list.`, flags: 64 });
            existing.push(channel.id);
            await save({ bypassChannels: existing.join(",") });
            return interaction.reply({ content: `✅ <#${channel.id}> added to the automod bypass list — messages there won't be filtered.`, flags: 64 });
        } else {
            const filtered = existing.filter((id) => id !== channel.id);
            if (filtered.length === existing.length) return interaction.reply({ content: `ℹ️ <#${channel.id}> wasn't in the bypass list.`, flags: 64 });
            await save({ bypassChannels: filtered.join(",") });
            return interaction.reply({ content: `✅ <#${channel.id}> removed from the bypass list.`, flags: 64 });
        }
    }
}
