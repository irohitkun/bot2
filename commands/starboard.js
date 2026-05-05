import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, starboardSettingsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { isPremium } from "../utils/permissions.js";

export const data = new SlashCommandBuilder()
    .setName("starboard")
    .setDescription("Hall-of-fame channel — messages with enough ⭐ reactions get immortalized (premium)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
        sub.setName("setup")
            .setDescription("Set up the starboard channel")
            .addChannelOption((o) => o.setName("channel").setDescription("Channel where starred messages appear").setRequired(true))
            .addIntegerOption((o) => o.setName("threshold").setDescription("Reactions needed to star a message (default: 3)").setMinValue(1).setMaxValue(50).setRequired(false))
            .addStringOption((o) => o.setName("emoji").setDescription("Reaction emoji to watch (default: ⭐)").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("threshold")
            .setDescription("Change the star count needed to appear on the starboard")
            .addIntegerOption((o) => o.setName("count").setDescription("Number of reactions needed").setMinValue(1).setMaxValue(50).setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("emoji")
            .setDescription("Change the reaction emoji the starboard watches")
            .addStringOption((o) => o.setName("emoji").setDescription("Emoji to use as the star").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("disable")
            .setDescription("Disable the starboard without losing settings"))
    .addSubcommand((sub) =>
        sub.setName("enable")
            .setDescription("Re-enable the starboard"))
    .addSubcommand((sub) =>
        sub.setName("status")
            .setDescription("View current starboard configuration"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "status") return handleStatus(interaction);

    if (!await isPremium(interaction.guild.id)) {
        return interaction.reply({
            content: "⭐ **Starboard** is a premium feature. Upgrade to unlock it.",
            flags: 64,
        });
    }

    if (sub === "setup")     return handleSetup(interaction);
    if (sub === "threshold") return handleThreshold(interaction);
    if (sub === "emoji")     return handleEmoji(interaction);
    if (sub === "disable")   return handleToggle(interaction, false);
    if (sub === "enable")    return handleToggle(interaction, true);
}

async function handleSetup(interaction) {
    const channel = interaction.options.getChannel("channel", true);
    const threshold = interaction.options.getInteger("threshold") ?? 3;
    const emoji = interaction.options.getString("emoji")?.trim() ?? "⭐";
    const { color } = await getGuildStyle(interaction.guild.id);

    await db.insert(starboardSettingsTable).values({
        guildId: interaction.guild.id,
        channelId: channel.id,
        threshold,
        emoji,
    }).onConflictDoUpdate({
        target: [starboardSettingsTable.guildId],
        set: { channelId: channel.id, threshold, emoji, enabled: true },
    });

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("⭐ Starboard Configured!")
            .addFields(
                { name: "Channel", value: channel.toString(), inline: true },
                { name: "Threshold", value: `${threshold} ${emoji}`, inline: true },
                { name: "Emoji", value: emoji, inline: true },
            )
            .setDescription(`Messages that receive **${threshold}** ${emoji} reactions will be posted to ${channel} for everyone to see!`)
            .setFooter({ text: "Starboard entries are permanent — stars lost later won't remove the post" })],
        flags: 64,
    });
}

async function handleThreshold(interaction) {
    const count = interaction.options.getInteger("count", true);
    const result = await db.update(starboardSettingsTable).set({ threshold: count })
        .where(eq(starboardSettingsTable.guildId, interaction.guild.id)).returning();
    if (result.length === 0) return interaction.reply({ content: "❌ Starboard not set up yet. Use `/starboard setup` first.", flags: 64 });
    return interaction.reply({ content: `✅ Starboard threshold updated to **${count}** reactions.`, flags: 64 });
}

async function handleEmoji(interaction) {
    const emoji = interaction.options.getString("emoji", true).trim();
    const result = await db.update(starboardSettingsTable).set({ emoji })
        .where(eq(starboardSettingsTable.guildId, interaction.guild.id)).returning();
    if (result.length === 0) return interaction.reply({ content: "❌ Starboard not set up yet.", flags: 64 });
    return interaction.reply({ content: `✅ Starboard emoji updated to **${emoji}**.`, flags: 64 });
}

async function handleToggle(interaction, enabled) {
    const result = await db.update(starboardSettingsTable).set({ enabled })
        .where(eq(starboardSettingsTable.guildId, interaction.guild.id)).returning();
    if (result.length === 0) return interaction.reply({ content: "❌ Starboard not set up yet.", flags: 64 });
    return interaction.reply({ content: `✅ Starboard **${enabled ? "enabled" : "disabled"}**.`, flags: 64 });
}

async function handleStatus(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const [settings] = await db.select().from(starboardSettingsTable)
        .where(eq(starboardSettingsTable.guildId, interaction.guild.id));

    if (!settings) return interaction.reply({ content: "Starboard is not configured. Use `/starboard setup` to enable it.", flags: 64 });

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("⭐ Starboard Status")
            .addFields(
                { name: "Status", value: settings.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
                { name: "Channel", value: `<#${settings.channelId}>`, inline: true },
                { name: "Threshold", value: `${settings.threshold} ${settings.emoji}`, inline: true },
            )],
        flags: 64,
    });
}
