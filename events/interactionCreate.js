import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } from "discord.js";
import { commands } from "../index.js";
import { db } from "../db/index.js";
import { ticketSettingsTable, ticketsTable } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { fetchAllMessages } from "../utils/fetchAllMessages.js";
import { executePlanByToken, peekPendingPlan, consumePendingPlan, logAIRun } from "../utils/aiAssistant.js";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
    // ── Slash commands ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
        if (!interaction.guild) {
            await interaction.reply({ content: "❌ This command can only be used inside a server.", flags: 64 }).catch(() => {});
            return;
        }
        const command = commands.get(interaction.commandName);
        if (!command) {
            console.warn(`Unknown command: ${interaction.commandName}`);
            return;
        }
        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(`Error executing /${interaction.commandName}:`, err);
            const msg = { content: "❌ An error occurred while running this command.", flags: 64 };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg).catch(() => {});
            } else {
                await interaction.reply(msg).catch(() => {});
            }
        }
        return;
    }

    // ── Button interactions ──────────────────────────────────────────────────
    if (interaction.isButton()) {
        const { customId, guild, user } = interaction;

        if (customId === "ticket:open") {
            return handleOpenTicket(interaction);
        }

        if (customId === "ticket:close") {
            return handleCloseTicketButton(interaction);
        }

        if (customId.startsWith("aiplan:")) {
            return handleAIPlanButton(interaction);
        }
    }
}

async function handleAIPlanButton(interaction) {
    const [, action, token] = interaction.customId.split(":");
    if (!token) return interaction.reply({ content: "❌ Invalid plan token.", flags: 64 }).catch(() => {});

    const entry = peekPendingPlan(token);
    if (!entry) {
        return interaction.update({
            content: "",
            embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🤖 AI Assistant").setDescription("This plan has expired or already been resolved.")],
            components: [],
        }).catch(() => {});
    }
    if (entry.invokerId !== interaction.user.id) {
        return interaction.reply({ content: `❌ Only <@${entry.invokerId}> can approve this plan.`, flags: 64 }).catch(() => {});
    }

    if (action === "cancel") {
        consumePendingPlan(token);
        await logAIRun({
            guild: interaction.guild,
            channel: interaction.channel,
            member: interaction.member,
            prompt: entry.prompt,
            planSummary: entry.planSummary,
            actions: entry.actions,
            results: [],
            status: "cancelled",
        });
        return interaction.update({
            content: "",
            embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🤖 AI Assistant — Cancelled").setDescription(`Plan cancelled by <@${interaction.user.id}>.`).setTimestamp()],
            components: [],
        }).catch(() => {});
    }

    if (action === "approve") {
        await interaction.deferUpdate().catch(() => {});
        const result = await executePlanByToken(interaction.client, token, interaction.user.id);
        if (!result.ok) {
            return interaction.editReply({
                content: "",
                embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("🤖 AI Assistant").setDescription(`❌ ${result.error}`)],
                components: [],
            }).catch(() => {});
        }
        return interaction.editReply(result.payload).catch(() => {});
    }

    return interaction.reply({ content: "❌ Unknown plan action.", flags: 64 }).catch(() => {});
}

async function handleOpenTicket(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const user = interaction.user;
    const { color } = await getGuildStyle(guild.id);

    const [settings] = await db.select().from(ticketSettingsTable).where(eq(ticketSettingsTable.guildId, guild.id));

    if (!settings?.categoryId) {
        return interaction.editReply({ content: "❌ The ticket system is not fully configured. Please ask an admin to run `/ticket setup`." });
    }

    // Check if user already has an open ticket
    const [existing] = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.guildId, guild.id), eq(ticketsTable.userId, user.id), eq(ticketsTable.status, "open")));

    if (existing) {
        return interaction.editReply({ content: `❌ You already have an open ticket: <#${existing.channelId}>` });
    }

    // Increment ticket count
    const newCount = (settings.ticketCount ?? 0) + 1;
    await db.update(ticketSettingsTable)
        .set({ ticketCount: newCount, updatedAt: new Date() })
        .where(eq(ticketSettingsTable.guildId, guild.id));

    const ticketNumber = newCount;
    const channelName = `ticket-${String(ticketNumber).padStart(4, "0")}`;

    // Build permission overwrites
    const overwrites = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
            id: guild.members.me.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
        },
    ];

    if (settings.supportRoleId) {
        overwrites.push({
            id: settings.supportRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
    }

    // Create the ticket channel
    const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: settings.categoryId,
        permissionOverwrites: overwrites,
        topic: `Ticket #${String(ticketNumber).padStart(4, "0")} opened by ${user.tag}`,
    });

    // Save to DB
    await db.insert(ticketsTable).values({
        guildId: guild.id,
        channelId: ticketChannel.id,
        userId: user.id,
        userTag: user.tag,
        ticketNumber,
        status: "open",
    });

    // Send the ticket embed
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎫 Ticket #${String(ticketNumber).padStart(4, "0")}`)
        .setDescription(`Hello <@${user.id}>! A member of our support team will be with you shortly.\n\nPlease describe your issue in detail and we will get back to you as soon as possible.`)
        .addFields({ name: "Opened By", value: `<@${user.id}> (${user.tag})`, inline: true })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket:close")
            .setLabel("Close Ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger),
    );

    await ticketChannel.send({ content: `<@${user.id}>${settings.supportRoleId ? ` | <@&${settings.supportRoleId}>` : ""}`, embeds: [embed], components: [row] });

    return interaction.editReply({ content: `✅ Your ticket has been created: <#${ticketChannel.id}>` });
}

async function handleCloseTicketButton(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const channel = interaction.channel;
    const { color } = await getGuildStyle(guild.id);

    const [ticket] = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.channelId, channel.id), eq(ticketsTable.status, "open")));

    if (!ticket) {
        return interaction.editReply({ content: "❌ This channel is not an open ticket." });
    }

    const [settings] = await db.select().from(ticketSettingsTable).where(eq(ticketSettingsTable.guildId, guild.id));

    // Generate full transcript (paginated — fetches all messages, not just last 100)
    const sorted = await fetchAllMessages(channel);
    const transcript = sorted.map((m) =>
        `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || "[embed/attachment]"}`
    ).join("\n");

    const transcriptBuffer = Buffer.from(transcript, "utf-8");

    if (settings?.transcriptChannelId) {
        const transcriptCh = guild.channels.cache.get(settings.transcriptChannelId);
        if (transcriptCh) {
            const tEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`📋 Ticket #${String(ticket.ticketNumber).padStart(4, "0")} Transcript`)
                .addFields(
                    { name: "Opened By", value: `<@${ticket.userId}> (${ticket.userTag})`, inline: true },
                    { name: "Closed By", value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                    { name: "Opened At", value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`, inline: true },
                    { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                )
                .setTimestamp();

            await transcriptCh.send({
                embeds: [tEmbed],
                files: [{ attachment: transcriptBuffer, name: `ticket-${String(ticket.ticketNumber).padStart(4, "0")}.txt` }],
            });
        }
    }

    await db.update(ticketsTable)
        .set({ status: "closed", closedBy: interaction.user.id, closedByTag: interaction.user.tag, closedAt: new Date() })
        .where(eq(ticketsTable.id, ticket.id));

    await interaction.editReply({ content: "🔒 Ticket closed. Transcript saved. Deleting channel in 5 seconds..." });
    setTimeout(() => channel.delete(`Ticket closed by ${interaction.user.tag}`).catch(() => {}), 5000);
}
