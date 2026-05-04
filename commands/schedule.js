import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, scheduledMessagesTable } from "../db/index.js";
import { and, eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { parseDuration } from "../utils/parseDuration.js";

export const data = new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Schedule a message to be sent in a channel at a specific time")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
        sub.setName("add")
            .setDescription("Schedule a message")
            .addStringOption((o) => o.setName("when").setDescription("When to send: relative (e.g. 2h, 30m) or UTC datetime (2025-12-01 18:00)").setRequired(true))
            .addStringOption((o) => o.setName("content").setDescription("Message content (markdown supported)").setRequired(true).setMaxLength(2000))
            .addChannelOption((o) => o.setName("channel").setDescription("Channel to send to (defaults to current)").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("List all pending scheduled messages in this server"))
    .addSubcommand((sub) =>
        sub.setName("cancel")
            .setDescription("Cancel a scheduled message by ID")
            .addIntegerOption((o) => o.setName("id").setDescription("Message ID from /schedule list").setRequired(true)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "add")    return handleAdd(interaction);
    if (sub === "list")   return handleList(interaction);
    if (sub === "cancel") return handleCancel(interaction);
}

async function handleAdd(interaction) {
    const when = interaction.options.getString("when", true).trim();
    const content = interaction.options.getString("content", true);
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const { color } = await getGuildStyle(interaction.guild.id);

    let sendAt;
    const ms = parseDuration(when);
    if (ms && ms >= 60_000) {
        sendAt = new Date(Date.now() + ms);
    } else {
        // Try parsing as absolute datetime (UTC)
        const parsed = new Date(when.includes(" ") ? when.replace(" ", "T") + "Z" : when);
        if (isNaN(parsed.getTime())) {
            return interaction.reply({ content: "❌ Invalid time. Use relative (`2h`, `30m`, `7d`) or UTC datetime (`2025-12-01 18:00`).", flags: 64 });
        }
        if (parsed.getTime() <= Date.now()) {
            return interaction.reply({ content: "❌ That time is in the past.", flags: 64 });
        }
        sendAt = parsed;
    }

    const maxMs = 30 * 24 * 60 * 60 * 1000; // 30 days max
    if (sendAt.getTime() - Date.now() > maxMs) {
        return interaction.reply({ content: "❌ Cannot schedule more than 30 days in advance.", flags: 64 });
    }

    const [row] = await db.insert(scheduledMessagesTable).values({
        guildId: interaction.guild.id,
        channelId: channel.id,
        content,
        sendAt,
        createdBy: interaction.user.id,
        createdByTag: interaction.user.tag,
    }).returning();

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("⏰ Message Scheduled")
            .addFields(
                { name: "Channel", value: channel.toString(), inline: true },
                { name: "Scheduled ID", value: `#${row.id}`, inline: true },
                { name: "Sends", value: `<t:${Math.floor(sendAt.getTime() / 1000)}:F> (<t:${Math.floor(sendAt.getTime() / 1000)}:R>)` },
            )
            .setDescription(content.length > 300 ? content.slice(0, 300) + "…" : content)
            .setFooter({ text: "Use /schedule cancel <id> to cancel" })],
        flags: 64,
    });
}

async function handleList(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const msgs = await db.select().from(scheduledMessagesTable)
        .where(and(eq(scheduledMessagesTable.guildId, interaction.guild.id), eq(scheduledMessagesTable.sent, false)));

    if (msgs.length === 0) return interaction.reply({ content: "No scheduled messages pending.", flags: 64 });

    const lines = msgs.map((m) =>
        `**#${m.id}** <t:${Math.floor(m.sendAt.getTime() / 1000)}:R> → <#${m.channelId}>\n↳ ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}`
    );
    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`⏰ Scheduled Messages (${msgs.length} pending)`)
            .setDescription(lines.join("\n\n").slice(0, 4000))],
        flags: 64,
    });
}

async function handleCancel(interaction) {
    const id = interaction.options.getInteger("id", true);
    const [row] = await db.select().from(scheduledMessagesTable)
        .where(and(eq(scheduledMessagesTable.id, id), eq(scheduledMessagesTable.guildId, interaction.guild.id)));

    if (!row) return interaction.reply({ content: `❌ Scheduled message #${id} not found in this server.`, flags: 64 });
    if (row.sent) return interaction.reply({ content: `❌ Message #${id} was already sent.`, flags: 64 });

    await db.delete(scheduledMessagesTable).where(eq(scheduledMessagesTable.id, id));
    return interaction.reply({ content: `✅ Scheduled message **#${id}** cancelled.`, flags: 64 });
}
