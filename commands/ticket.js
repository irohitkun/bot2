import {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
} from "discord.js";
import { db } from "../db/index.js";
import { ticketSettingsTable, ticketsTable } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket system management")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
        sub.setName("setup")
            .setDescription("Configure the ticket system for this server")
            .addChannelOption((opt) =>
                opt.setName("category")
                    .setDescription("Category where ticket channels are created (leave blank to auto-create)")
                    .addChannelTypes(ChannelType.GuildCategory)
                    .setRequired(false))
            .addChannelOption((opt) =>
                opt.setName("transcript_channel")
                    .setDescription("Channel where ticket transcripts are saved (leave blank to auto-create)")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(false))
            .addRoleOption((opt) =>
                opt.setName("support_role")
                    .setDescription("Role that can see all ticket channels")
                    .setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("panel")
            .setDescription("Post a ticket panel with an Open Ticket button")
            .addChannelOption((opt) =>
                opt.setName("channel")
                    .setDescription("Channel to post the panel in")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true))
            .addStringOption((opt) =>
                opt.setName("title")
                    .setDescription("Panel title")
                    .setRequired(false))
            .addStringOption((opt) =>
                opt.setName("description")
                    .setDescription("Panel description")
                    .setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("close")
            .setDescription("Close the current ticket and save a transcript")
            .addStringOption((opt) =>
                opt.setName("reason")
                    .setDescription("Reason for closing")
                    .setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("add")
            .setDescription("Add a user to the current ticket")
            .addUserOption((opt) =>
                opt.setName("user")
                    .setDescription("User to add")
                    .setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("remove")
            .setDescription("Remove a user from the current ticket")
            .addUserOption((opt) =>
                opt.setName("user")
                    .setDescription("User to remove")
                    .setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("config")
            .setDescription("View current ticket system configuration"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") return handleSetup(interaction);
    if (sub === "panel") return handlePanel(interaction);
    if (sub === "close") return handleClose(interaction);
    if (sub === "add") return handleAdd(interaction);
    if (sub === "remove") return handleRemove(interaction);
    if (sub === "config") return handleConfig(interaction);
}

async function handleSetup(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const { color } = await getGuildStyle(guild.id);

    let category = interaction.options.getChannel("category");
    let transcriptChannel = interaction.options.getChannel("transcript_channel");
    const supportRole = interaction.options.getRole("support_role");

    // Auto-create category if not provided
    if (!category) {
        category = await guild.channels.create({
            name: "Tickets",
            type: ChannelType.GuildCategory,
        });
    }

    // Auto-create transcript channel if not provided
    if (!transcriptChannel) {
        transcriptChannel = await guild.channels.create({
            name: "ticket-transcripts",
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                ...(supportRole ? [{ id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel] }] : []),
            ],
        });
    }

    await db.insert(ticketSettingsTable).values({
        guildId: guild.id,
        categoryId: category.id,
        transcriptChannelId: transcriptChannel.id,
        supportRoleId: supportRole?.id ?? null,
    }).onConflictDoUpdate({
        target: ticketSettingsTable.guildId,
        set: {
            categoryId: category.id,
            transcriptChannelId: transcriptChannel.id,
            supportRoleId: supportRole?.id ?? null,
            updatedAt: new Date(),
        },
    });

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("✅ Ticket System Configured")
        .addFields(
            { name: "Category", value: `<#${category.id}>`, inline: true },
            { name: "Transcripts", value: `<#${transcriptChannel.id}>`, inline: true },
            { name: "Support Role", value: supportRole ? `<@&${supportRole.id}>` : "None set", inline: true },
        )
        .setDescription("Use `/ticket panel` to post an Open Ticket button in a channel.")
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function handlePanel(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const { color } = await getGuildStyle(guild.id);

    const [settings] = await db.select().from(ticketSettingsTable).where(eq(ticketSettingsTable.guildId, guild.id));
    if (!settings?.categoryId) {
        return interaction.editReply({ content: "❌ Please run `/ticket setup` first to configure the ticket system." });
    }

    const channel = interaction.options.getChannel("channel", true);
    const title = interaction.options.getString("title") ?? settings.panelTitle;
    const description = interaction.options.getString("description") ?? settings.panelDescription;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎫 ${title}`)
        .setDescription(description)
        .setFooter({ text: "Click the button below to open a ticket" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket:open")
            .setLabel("Open Ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary),
    );

    const panelMsg = await channel.send({ embeds: [embed], components: [row] });

    await db.update(ticketSettingsTable)
        .set({ panelChannelId: channel.id, panelMessageId: panelMsg.id, panelTitle: title, panelDescription: description, updatedAt: new Date() })
        .where(eq(ticketSettingsTable.guildId, guild.id));

    return interaction.editReply({ content: `✅ Ticket panel posted in <#${channel.id}>!` });
}

async function handleClose(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const channel = interaction.channel;
    const { color } = await getGuildStyle(guild.id);

    const [ticket] = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.channelId, channel.id), eq(ticketsTable.status, "open")));

    if (!ticket) {
        return interaction.editReply({ content: "❌ This channel is not an open ticket." });
    }

    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const [settings] = await db.select().from(ticketSettingsTable).where(eq(ticketSettingsTable.guildId, guild.id));

    // Generate transcript
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].reverse();
    const transcript = sorted.map((m) =>
        `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || "[embed/attachment]"}`
    ).join("\n");

    const transcriptBuffer = Buffer.from(transcript, "utf-8");

    // Save transcript
    if (settings?.transcriptChannelId) {
        const transcriptChannel = guild.channels.cache.get(settings.transcriptChannelId);
        if (transcriptChannel) {
            const transcriptEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`📋 Ticket #${String(ticket.ticketNumber).padStart(4, "0")} Transcript`)
                .addFields(
                    { name: "Opened By", value: `<@${ticket.userId}> (${ticket.userTag})`, inline: true },
                    { name: "Closed By", value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                    { name: "Reason", value: reason, inline: false },
                    { name: "Opened At", value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`, inline: true },
                    { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                )
                .setTimestamp();

            await transcriptChannel.send({
                embeds: [transcriptEmbed],
                files: [{ attachment: transcriptBuffer, name: `ticket-${String(ticket.ticketNumber).padStart(4, "0")}.txt` }],
            });
        }
    }

    await db.update(ticketsTable)
        .set({ status: "closed", closedBy: interaction.user.id, closedByTag: interaction.user.tag, closedAt: new Date() })
        .where(eq(ticketsTable.id, ticket.id));

    await interaction.editReply({ content: "✅ Ticket closed. Deleting channel in 5 seconds..." });
    setTimeout(() => channel.delete(`Ticket closed by ${interaction.user.tag}: ${reason}`).catch(() => {}), 5000);
}

async function handleAdd(interaction) {
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.options.getUser("user", true);

    const [ticket] = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.channelId, channel.id), eq(ticketsTable.status, "open")));

    if (!ticket) {
        return interaction.reply({ content: "❌ This channel is not an open ticket.", flags: 64 });
    }

    await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
    });

    return interaction.reply({ content: `✅ Added <@${user.id}> to the ticket.`, flags: 64 });
}

async function handleRemove(interaction) {
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.options.getUser("user", true);

    const [ticket] = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.channelId, channel.id), eq(ticketsTable.status, "open")));

    if (!ticket) {
        return interaction.reply({ content: "❌ This channel is not an open ticket.", flags: 64 });
    }

    if (ticket.userId === user.id) {
        return interaction.reply({ content: "❌ You cannot remove the ticket owner.", flags: 64 });
    }

    await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });

    return interaction.reply({ content: `✅ Removed <@${user.id}> from the ticket.`, flags: 64 });
}

async function handleConfig(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const { color } = await getGuildStyle(guild.id);

    const [settings] = await db.select().from(ticketSettingsTable).where(eq(ticketSettingsTable.guildId, guild.id));

    if (!settings?.categoryId) {
        return interaction.editReply({ content: "❌ The ticket system has not been configured yet. Use `/ticket setup`." });
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🎫 Ticket System Configuration")
        .addFields(
            { name: "Category", value: settings.categoryId ? `<#${settings.categoryId}>` : "Not set", inline: true },
            { name: "Transcript Channel", value: settings.transcriptChannelId ? `<#${settings.transcriptChannelId}>` : "Not set", inline: true },
            { name: "Support Role", value: settings.supportRoleId ? `<@&${settings.supportRoleId}>` : "None", inline: true },
            { name: "Total Tickets Created", value: String(settings.ticketCount), inline: true },
            { name: "Panel", value: settings.panelMessageId ? `[View Panel](https://discord.com/channels/${guild.id}/${settings.panelChannelId}/${settings.panelMessageId})` : "Not posted", inline: true },
        )
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}
