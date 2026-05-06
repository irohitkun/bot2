import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db, antinukeSettingsTable, antinukeWhitelistTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { requireAdmin } from "../utils/permissions.js";

export const data = new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Protect your server from mass destructive actions")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("enable").setDescription("Enable antinuke protection"))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable antinuke protection"))
    .addSubcommand((sub) => sub.setName("settings").setDescription("Configure antinuke thresholds and action")
        .addIntegerOption((o) => o.setName("ban_threshold").setDescription("Max bans allowed per time window (default: 3)").setMinValue(1).setMaxValue(20))
        .addIntegerOption((o) => o.setName("kick_threshold").setDescription("Max kicks allowed per time window (default: 3)").setMinValue(1).setMaxValue(20))
        .addIntegerOption((o) => o.setName("channel_threshold").setDescription("Max channel deletes allowed (default: 3)").setMinValue(1).setMaxValue(20))
        .addIntegerOption((o) => o.setName("role_threshold").setDescription("Max role deletes allowed (default: 3)").setMinValue(1).setMaxValue(20))
        .addIntegerOption((o) => o.setName("time_window").setDescription("Time window in seconds (default: 10)").setMinValue(5).setMaxValue(60))
        .addStringOption((o) => o.setName("action").setDescription("Action to take against nuker").addChoices(
            { name: "ban", value: "ban" },
            { name: "kick", value: "kick" },
            { name: "strip roles", value: "strip" },
        ))
        .addChannelOption((o) => o.setName("log_channel").setDescription("Channel to log antinuke alerts")))
    .addSubcommand((sub) => sub.setName("whitelist").setDescription("Add a user to the antinuke whitelist")
        .addUserOption((o) => o.setName("user").setDescription("User to whitelist").setRequired(true)))
    .addSubcommand((sub) => sub.setName("unwhitelist").setDescription("Remove a user from the whitelist")
        .addUserOption((o) => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand((sub) => sub.setName("status").setDescription("View current antinuke configuration"));

export async function execute(interaction) {
    if (interaction.guild.ownerId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Only the server owner or admins can manage antinuke.", flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const { color } = await getGuildStyle(guildId);

    if (sub === "enable") {
        await db.insert(antinukeSettingsTable).values({ guildId, enabled: true, updatedAt: new Date() })
            .onConflictDoUpdate({ target: antinukeSettingsTable.guildId, set: { enabled: true, updatedAt: new Date() } });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("🛡️ AntiNuke Enabled").setDescription("Your server is now protected against mass destructive actions.\n\nUse `/antinuke settings` to configure thresholds, and `/antinuke whitelist` to trust admins.").setTimestamp()] });
    }

    if (sub === "disable") {
        await db.update(antinukeSettingsTable).set({ enabled: false, updatedAt: new Date() }).where(eq(antinukeSettingsTable.guildId, guildId));
        return interaction.reply({ content: "⚠️ AntiNuke has been **disabled**.", flags: 64 });
    }

    if (sub === "settings") {
        const set = {};
        const banThreshold = interaction.options.getInteger("ban_threshold");
        const kickThreshold = interaction.options.getInteger("kick_threshold");
        const channelThreshold = interaction.options.getInteger("channel_threshold");
        const roleThreshold = interaction.options.getInteger("role_threshold");
        const timeWindow = interaction.options.getInteger("time_window");
        const action = interaction.options.getString("action");
        const logChannel = interaction.options.getChannel("log_channel");
        if (banThreshold !== null) set.banThreshold = banThreshold;
        if (kickThreshold !== null) set.kickThreshold = kickThreshold;
        if (channelThreshold !== null) set.channelThreshold = channelThreshold;
        if (roleThreshold !== null) set.roleThreshold = roleThreshold;
        if (timeWindow !== null) set.timeWindow = timeWindow;
        if (action !== null) set.action = action;
        if (logChannel !== null) set.logChannelId = logChannel.id;
        set.updatedAt = new Date();
        await db.insert(antinukeSettingsTable).values({ guildId, ...set }).onConflictDoUpdate({ target: antinukeSettingsTable.guildId, set });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle("🛡️ AntiNuke Settings Updated").setDescription("Settings saved. Use `/antinuke status` to review the full configuration.").setTimestamp()] });
    }

    if (sub === "whitelist") {
        const user = interaction.options.getUser("user");
        await db.insert(antinukeWhitelistTable).values({ guildId, userId: user.id }).onConflictDoNothing();
        return interaction.reply({ content: `✅ **${user.tag}** has been whitelisted — antinuke will not trigger against them.`, flags: 64 });
    }

    if (sub === "unwhitelist") {
        const user = interaction.options.getUser("user");
        await db.delete(antinukeWhitelistTable).where(and(eq(antinukeWhitelistTable.guildId, guildId), eq(antinukeWhitelistTable.userId, user.id)));
        return interaction.reply({ content: `✅ **${user.tag}** removed from the whitelist.`, flags: 64 });
    }

    if (sub === "status") {
        const [settings] = await db.select().from(antinukeSettingsTable).where(eq(antinukeSettingsTable.guildId, guildId));
        const whitelist = await db.select().from(antinukeWhitelistTable).where(eq(antinukeWhitelistTable.guildId, guildId));
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle("🛡️ AntiNuke Status")
            .addFields(
                { name: "Status", value: settings?.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
                { name: "Action", value: settings?.action ?? "ban", inline: true },
                { name: "Time Window", value: `${settings?.timeWindow ?? 10}s`, inline: true },
                { name: "Thresholds", value: `Ban: ${settings?.banThreshold ?? 3} | Kick: ${settings?.kickThreshold ?? 3} | Channel delete: ${settings?.channelThreshold ?? 3} | Role delete: ${settings?.roleThreshold ?? 3}`, inline: false },
                { name: "Log Channel", value: settings?.logChannelId ? `<#${settings.logChannelId}>` : "Not set", inline: true },
                { name: "Whitelisted Users", value: whitelist.length > 0 ? whitelist.map((w) => `<@${w.userId}>`).join(", ") : "None", inline: false },
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
}
