import {
    Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionFlagsBits,
} from "discord.js";
import { commands } from "../index.js";
import { db } from "../db/index.js";
import {
    ticketSettingsTable, ticketsTable, verificationSettingsTable,
    confessionSettingsTable, confessionsTable,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { fetchAllMessages } from "../utils/fetchAllMessages.js";
import { executePlanByToken, peekPendingPlan, consumePendingPlan, logAIRun } from "../utils/aiAssistant.js";
import { helpCategories, getHelpCategory, formatCommands } from "../utils/helpCatalog.js";
import { getPrefix } from "../utils/prefixCache.js";
import { checkCooldown, formatRemaining } from "../utils/cooldown.js";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
    // ── Slash commands ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
        if (!interaction.guild) {
            await interaction.reply({ content: "❌ This command can only be used inside a server.", flags: 64 }).catch(() => {});
            return;
        }

        // Rate limiting
        const heavyCommands = new Set(["purge", "massrole", "lockdown", "giveaway", "ai"]);
        const cooldownMs = heavyCommands.has(interaction.commandName) ? 8000 : 3000;
        const cdKey = `slash:${interaction.commandName}:${interaction.user.id}`;
        const cd = checkCooldown(cdKey, cooldownMs);
        if (cd.onCooldown) {
            return interaction.reply({ content: `⏳ Slow down! This command is on cooldown. Try again in **${formatRemaining(cd.remaining)}**.`, flags: 64 }).catch(() => {});
        }

        const command = commands.get(interaction.commandName);
        if (!command) { console.warn(`Unknown command: ${interaction.commandName}`); return; }
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

    // ── Select menu — help category browser ─────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === "help:category") {
        const key = interaction.values[0];
        const { color } = await getGuildStyle(interaction.guild.id);
        const prefix = await getPrefix(interaction.guild.id);
        const category = getHelpCategory(key);
        if (!category) return interaction.reply({ content: "❌ Unknown category.", flags: 64 }).catch(() => {});

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${category.emoji ?? "📁"} ${category.label} Commands`)
            .setDescription(`Use \`/command\` for slash or \`${prefix}command\` for prefix.\n\n` + formatCommands(category.commands))
            .setFooter({ text: `${category.commands.length} commands in this category` })
            .setTimestamp();

        return interaction.update({ embeds: [embed] }).catch(() =>
            interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {})
        );
    }

    // ── Modals ───────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith("confession:submit:")) {
            return handleConfessionSubmit(interaction);
        }
    }

    // ── Button interactions ──────────────────────────────────────────────────
    if (interaction.isButton()) {
        const { customId } = interaction;
        if (customId === "ticket:open") return handleOpenTicket(interaction);
        if (customId === "ticket:close") return handleCloseTicketButton(interaction);
        if (customId.startsWith("aiplan:")) return handleAIPlanButton(interaction);
        if (customId === "verify:click") return handleVerification(interaction);
        if (customId.startsWith("confession:approve:")) return handleConfessionApprove(interaction);
        if (customId.startsWith("confession:deny:")) return handleConfessionDeny(interaction);
    }
}

// ── AI Plan buttons ──────────────────────────────────────────────────────────
async function handleAIPlanButton(interaction) {
    const [, action, token] = interaction.customId.split(":");
    if (!token) return interaction.reply({ content: "❌ Invalid plan token.", flags: 64 }).catch(() => {});
    const entry = peekPendingPlan(token);
    if (!entry) {
        return interaction.update({
            content: "", embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🤖 AI Assistant").setDescription("This plan has expired or already been resolved.")], components: [],
        }).catch(() => {});
    }
    if (entry.invokerId !== interaction.user.id) {
        return interaction.reply({ content: `❌ Only <@${entry.invokerId}> can approve this plan.`, flags: 64 }).catch(() => {});
    }
    if (action === "cancel") {
        consumePendingPlan(token);
        await logAIRun({ guild: interaction.guild, channel: interaction.channel, member: interaction.member, prompt: entry.prompt, planSummary: entry.planSummary, actions: entry.actions, results: [], status: "cancelled" });
        return interaction.update({
            content: "", embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🤖 AI Assistant — Cancelled").setDescription(`Plan cancelled by <@${interaction.user.id}>.`).setTimestamp()], components: [],
        }).catch(() => {});
    }
    if (action === "approve") {
        await interaction.deferUpdate().catch(() => {});
        const result = await executePlanByToken(interaction.client, token, interaction.user.id);
        if (!result.ok) {
            return interaction.editReply({ content: "", embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("🤖 AI Assistant").setDescription(`❌ ${result.error}`)], components: [] }).catch(() => {});
        }
        return interaction.editReply(result.payload).catch(() => {});
    }
    return interaction.reply({ content: "❌ Unknown plan action.", flags: 64 }).catch(() => {});
}

// ── Ticket open ──────────────────────────────────────────────────────────────
async function handleOpenTicket(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const user = interaction.user;
    const { color } = await getGuildStyle(guild.id);
    const [settings] = await db.select().from(ticketSettingsTable).where(eq(ticketSettingsTable.guildId, guild.id));
    if (!settings?.categoryId) {
        return interaction.editReply({ content: "❌ The ticket system is not configured. Ask an admin to run `/ticket setup`." });
    }
    const [existing] = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.guildId, guild.id), eq(ticketsTable.userId, user.id), eq(ticketsTable.status, "open")));
    if (existing) {
        return interaction.editReply({ content: `❌ You already have an open ticket: <#${existing.channelId}>` });
    }
    const newCount = (settings.ticketCount ?? 0) + 1;
    await db.update(ticketSettingsTable).set({ ticketCount: newCount, updatedAt: new Date() }).where(eq(ticketSettingsTable.guildId, guild.id));

    // FIX: Channel name is ticket-username instead of ticket-0001
    const safeUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
    const channelName = `ticket-${safeUsername}`;

    const overwrites = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
    ];
    if (settings.supportRoleId) {
        overwrites.push({ id: settings.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }
    const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: settings.categoryId,
        permissionOverwrites: overwrites,
        topic: `Ticket #${newCount} opened by ${user.tag}`,
    });
    await db.insert(ticketsTable).values({
        guildId: guild.id, channelId: ticketChannel.id, userId: user.id,
        userTag: user.tag, ticketNumber: newCount, status: "open",
    });
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎫 Ticket #${newCount}`)
        .setDescription(`Hello <@${user.id}>! A member of our support team will be with you shortly.\n\nPlease describe your issue in detail.`)
        .addFields({ name: "Opened By", value: `<@${user.id}> (${user.tag})`, inline: true })
        .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Close Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    );
    await ticketChannel.send({ content: `<@${user.id}>${settings.supportRoleId ? ` | <@&${settings.supportRoleId}>` : ""}`, embeds: [embed], components: [row] });
    return interaction.editReply({ content: `✅ Your ticket has been created: <#${ticketChannel.id}>` });
}

// ── Ticket close ─────────────────────────────────────────────────────────────
async function handleCloseTicketButton(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const channel = interaction.channel;
    const { color } = await getGuildStyle(guild.id);
    const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.channelId, channel.id), eq(ticketsTable.status, "open")));
    if (!ticket) return interaction.editReply({ content: "❌ This channel is not an open ticket." });
    const [settings] = await db.select().from(ticketSettingsTable).where(eq(ticketSettingsTable.guildId, guild.id));
    const sorted = await fetchAllMessages(channel);
    const transcript = sorted.map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || "[embed/attachment]"}`).join("\n");
    const transcriptBuffer = Buffer.from(transcript, "utf-8");
    if (settings?.transcriptChannelId) {
        const transcriptCh = guild.channels.cache.get(settings.transcriptChannelId);
        if (transcriptCh) {
            const tEmbed = new EmbedBuilder().setColor(color)
                .setTitle(`📋 Ticket #${ticket.ticketNumber} Transcript`)
                .addFields(
                    { name: "Opened By", value: `<@${ticket.userId}> (${ticket.userTag})`, inline: true },
                    { name: "Closed By", value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                    { name: "Opened At", value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`, inline: true },
                    { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                ).setTimestamp();
            await transcriptCh.send({ embeds: [tEmbed], files: [{ attachment: transcriptBuffer, name: `ticket-${ticket.ticketNumber}.txt` }] });
        }
    }
    await db.update(ticketsTable).set({ status: "closed", closedBy: interaction.user.id, closedByTag: interaction.user.tag, closedAt: new Date() }).where(eq(ticketsTable.id, ticket.id));
    await interaction.editReply({ content: "🔒 Ticket closed. Transcript saved. Deleting channel in 5 seconds..." });
    setTimeout(() => channel.delete(`Ticket closed by ${interaction.user.tag}`).catch(() => {}), 5000);
}

// ── Verification button ──────────────────────────────────────────────────────
async function handleVerification(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;
    const [settings] = await db.select().from(verificationSettingsTable).where(eq(verificationSettingsTable.guildId, guild.id));
    if (!settings?.enabled || !settings.roleId) {
        return interaction.reply({ content: "❌ Verification is not properly configured.", flags: 64 });
    }
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: "❌ Could not find your member record.", flags: 64 });
    if (member.roles.cache.has(settings.roleId)) {
        return interaction.reply({ content: "✅ You're already verified!", flags: 64 });
    }
    const role = guild.roles.cache.get(settings.roleId);
    if (!role) {
        return interaction.reply({ content: "❌ The verification role no longer exists. Please contact an admin.", flags: 64 });
    }
    try {
        await member.roles.add(role, "Verification button");
        return interaction.reply({ content: `✅ You've been verified and granted the **${role.name}** role! Welcome to ${guild.name}.`, flags: 64 });
    } catch (err) {
        console.warn("[Verification] Failed to add role:", err.message);
        return interaction.reply({ content: "❌ I couldn't give you the verification role — check that my role is above it.", flags: 64 });
    }
}

// ── Confession modal submit ──────────────────────────────────────────────────
async function handleConfessionSubmit(interaction) {
    const guildId = interaction.customId.split(":")[2];
    const content = interaction.fields.getTextInputValue("confession_text");
    const [settings] = await db.select().from(confessionSettingsTable).where(eq(confessionSettingsTable.guildId, guildId));
    if (!settings?.enabled || !settings.channelId) {
        return interaction.reply({ content: "❌ Confessions are no longer enabled.", flags: 64 });
    }
    const { color } = await getGuildStyle(guildId);
    const guild = interaction.guild;
    const [confession] = await db.insert(confessionsTable).values({
        guildId, authorId: interaction.user.id, content,
        status: settings.reviewChannelId ? "pending" : "approved",
    }).returning();
    if (settings.reviewChannelId) {
        const reviewCh = guild.channels.cache.get(settings.reviewChannelId);
        if (reviewCh?.isTextBased()) {
            const embed = new EmbedBuilder()
                .setColor(0xfee75c)
                .setTitle(`📝 Confession #${confession.id} — Pending Review`)
                .setDescription(content)
                .setFooter({ text: "Approve to post anonymously | Deny to reject" })
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`confession:approve:${confession.id}`).setLabel("Approve").setEmoji("✅").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`confession:deny:${confession.id}`).setLabel("Deny").setEmoji("❌").setStyle(ButtonStyle.Danger),
            );
            await reviewCh.send({ embeds: [embed], components: [row] });
        }
        return interaction.reply({ content: "✅ Your confession has been submitted for mod review. It will be posted anonymously if approved.", flags: 64 });
    }
    const channel = guild.channels.cache.get(settings.channelId);
    if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`💭 Anonymous Confession #${confession.id}`)
            .setDescription(content)
            .setFooter({ text: "Use /confession submit to share your own" })
            .setTimestamp();
        const msg = await channel.send({ embeds: [embed] }).catch(() => null);
        if (msg) {
            await db.update(confessionsTable).set({ confessionMessageId: msg.id, status: "approved" }).where(eq(confessionsTable.id, confession.id));
        }
    }
    return interaction.reply({ content: "✅ Your anonymous confession has been posted!", flags: 64 });
}

// ── Confession approve ───────────────────────────────────────────────────────
async function handleConfessionApprove(interaction) {
    const confessionId = parseInt(interaction.customId.split(":")[2]);
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: "❌ You need Manage Messages permission to approve confessions.", flags: 64 });
    }
    const [confession] = await db.select().from(confessionsTable).where(eq(confessionsTable.id, confessionId));
    if (!confession || confession.status !== "pending") {
        return interaction.update({ components: [] }).catch(() => {});
    }
    const [settings] = await db.select().from(confessionSettingsTable).where(eq(confessionSettingsTable.guildId, confession.guildId));
    const { color } = await getGuildStyle(confession.guildId);
    const channel = interaction.guild.channels.cache.get(settings?.channelId ?? "");
    if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`💭 Anonymous Confession #${confession.id}`)
            .setDescription(confession.content)
            .setFooter({ text: "Use /confession submit to share your own" })
            .setTimestamp();
        const msg = await channel.send({ embeds: [embed] }).catch(() => null);
        await db.update(confessionsTable).set({ status: "approved", confessionMessageId: msg?.id ?? null }).where(eq(confessionsTable.id, confessionId));
    }
    await interaction.update({
        embeds: [new EmbedBuilder().setColor(0x57f287).setTitle(`✅ Confession #${confessionId} Approved`).setDescription(`Approved by ${interaction.user.tag}`).setTimestamp()],
        components: [],
    }).catch(() => {});
}

// ── Confession deny ──────────────────────────────────────────────────────────
async function handleConfessionDeny(interaction) {
    const confessionId = parseInt(interaction.customId.split(":")[2]);
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: "❌ You need Manage Messages permission to deny confessions.", flags: 64 });
    }
    await db.update(confessionsTable).set({ status: "denied" }).where(eq(confessionsTable.id, confessionId));
    await interaction.update({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(`❌ Confession #${confessionId} Denied`).setDescription(`Denied by ${interaction.user.tag}`).setTimestamp()],
        components: [],
    }).catch(() => {});
}
