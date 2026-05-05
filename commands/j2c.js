import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from "discord.js";
import { db, j2cHubsTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { isPremium } from "../utils/permissions.js";

export const data = new SlashCommandBuilder()
    .setName("j2c")
    .setDescription("Join-to-Create voice channels — users join a hub and get their own private VC (premium)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
        sub.setName("setup")
            .setDescription("Set a voice channel as a J2C hub")
            .addChannelOption((o) =>
                o.setName("hub")
                    .setDescription("Voice channel users will join to get a private VC")
                    .addChannelTypes(ChannelType.GuildVoice)
                    .setRequired(true))
            .addStringOption((o) =>
                o.setName("template")
                    .setDescription('Name template for created channels. Use {user} or {game}. Default: "{user}\'s Channel"')
                    .setRequired(false)
                    .setMaxLength(100))
            .addIntegerOption((o) =>
                o.setName("limit")
                    .setDescription("User limit for created channels (0 = unlimited)")
                    .setMinValue(0).setMaxValue(99).setRequired(false))
            .addIntegerOption((o) =>
                o.setName("bitrate")
                    .setDescription("Audio bitrate in kbps (default 64)")
                    .setMinValue(8).setMaxValue(384).setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("template")
            .setDescription("Update the name template for a hub")
            .addChannelOption((o) =>
                o.setName("hub").setDescription("The hub channel to configure")
                    .addChannelTypes(ChannelType.GuildVoice).setRequired(true))
            .addStringOption((o) =>
                o.setName("template").setDescription('Template string. Use {user} or {game}').setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) =>
        sub.setName("limit")
            .setDescription("Set the user limit for channels created by a hub")
            .addChannelOption((o) =>
                o.setName("hub").setDescription("The hub channel")
                    .addChannelTypes(ChannelType.GuildVoice).setRequired(true))
            .addIntegerOption((o) =>
                o.setName("limit").setDescription("0 = unlimited").setMinValue(0).setMaxValue(99).setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("remove")
            .setDescription("Remove J2C from a hub channel")
            .addChannelOption((o) =>
                o.setName("hub").setDescription("Hub to remove")
                    .addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("List all J2C hubs in this server"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "list") return handleList(interaction);

    // All write operations require premium
    if (!await isPremium(interaction.guild.id)) {
        return interaction.reply({
            content: "⭐ **Join-to-Create** is a premium feature. Upgrade at your service panel to unlock it.",
            flags: 64,
        });
    }

    if (sub === "setup")    return handleSetup(interaction);
    if (sub === "template") return handleTemplate(interaction);
    if (sub === "limit")    return handleLimit(interaction);
    if (sub === "remove")   return handleRemove(interaction);
}

async function handleSetup(interaction) {
    const hub = interaction.options.getChannel("hub", true);
    const template = interaction.options.getString("template") ?? "{user}'s Channel";
    const limit = interaction.options.getInteger("limit") ?? 0;
    const bitrate = interaction.options.getInteger("bitrate") ?? 64;
    const { color } = await getGuildStyle(interaction.guild.id);

    await db.insert(j2cHubsTable).values({
        guildId: interaction.guild.id,
        channelId: hub.id,
        nameTemplate: template,
        userLimit: limit,
        bitrate,
        createdBy: interaction.user.id,
    }).onConflictDoUpdate({
        target: [j2cHubsTable.channelId],
        set: { nameTemplate: template, userLimit: limit, bitrate, createdBy: interaction.user.id },
    });

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("✅ J2C Hub Configured")
            .addFields(
                { name: "Hub Channel", value: hub.toString(), inline: true },
                { name: "Name Template", value: `\`${template}\``, inline: true },
                { name: "User Limit", value: limit === 0 ? "Unlimited" : `${limit}`, inline: true },
                { name: "Bitrate", value: `${bitrate} kbps`, inline: true },
            )
            .setDescription("Users who join this voice channel will get their own temporary private VC, named after the template. It auto-deletes when everyone leaves.")
            .setFooter({ text: "Template variables: {user} = display name, {game} = current game activity" })],
        flags: 64,
    });
}

async function handleTemplate(interaction) {
    const hub = interaction.options.getChannel("hub", true);
    const template = interaction.options.getString("template", true);

    const result = await db.update(j2cHubsTable)
        .set({ nameTemplate: template })
        .where(and(eq(j2cHubsTable.guildId, interaction.guild.id), eq(j2cHubsTable.channelId, hub.id)))
        .returning();

    if (result.length === 0) return interaction.reply({ content: `❌ ${hub} is not configured as a J2C hub. Use \`/j2c setup\` first.`, flags: 64 });
    return interaction.reply({ content: `✅ Template updated to \`${template}\` for ${hub}.`, flags: 64 });
}

async function handleLimit(interaction) {
    const hub = interaction.options.getChannel("hub", true);
    const limit = interaction.options.getInteger("limit", true);

    const result = await db.update(j2cHubsTable)
        .set({ userLimit: limit })
        .where(and(eq(j2cHubsTable.guildId, interaction.guild.id), eq(j2cHubsTable.channelId, hub.id)))
        .returning();

    if (result.length === 0) return interaction.reply({ content: `❌ ${hub} is not a J2C hub.`, flags: 64 });
    return interaction.reply({ content: `✅ User limit for ${hub} set to **${limit === 0 ? "unlimited" : limit}**.`, flags: 64 });
}

async function handleRemove(interaction) {
    const hub = interaction.options.getChannel("hub", true);
    const result = await db.delete(j2cHubsTable)
        .where(and(eq(j2cHubsTable.guildId, interaction.guild.id), eq(j2cHubsTable.channelId, hub.id)))
        .returning();
    if (result.length === 0) return interaction.reply({ content: `❌ ${hub} is not a J2C hub.`, flags: 64 });
    return interaction.reply({ content: `✅ J2C removed from ${hub}. Existing temp channels were not deleted.`, flags: 64 });
}

async function handleList(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const hubs = await db.select().from(j2cHubsTable).where(eq(j2cHubsTable.guildId, interaction.guild.id));

    if (hubs.length === 0) return interaction.reply({ content: "No J2C hubs configured. Use `/j2c setup` to get started.", flags: 64 });

    const lines = hubs.map((h) =>
        `<#${h.channelId}> — \`${h.nameTemplate}\` · limit: ${h.userLimit === 0 ? "∞" : h.userLimit} · ${h.bitrate}kbps`
    );
    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`🎙️ J2C Hubs (${hubs.length})`).setDescription(lines.join("\n"))],
        flags: 64,
    });
}
