import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, stickyMessagesTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Sticky messages — a message that re-posts itself at the bottom after every new message")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
        sub.setName("set")
            .setDescription("Set a sticky message for a channel")
            .addStringOption((o) => o.setName("content").setDescription("Sticky message content (markdown supported)").setRequired(true).setMaxLength(2000))
            .addChannelOption((o) => o.setName("channel").setDescription("Channel (defaults to current)").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("remove")
            .setDescription("Remove the sticky message from a channel")
            .addChannelOption((o) => o.setName("channel").setDescription("Channel (defaults to current)").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("List all sticky messages in this server"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "set")    return handleSet(interaction);
    if (sub === "remove") return handleRemove(interaction);
    if (sub === "list")   return handleList(interaction);
}

async function handleSet(interaction) {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const content = interaction.options.getString("content", true);
    const { color } = await getGuildStyle(interaction.guild.id);

    await db.insert(stickyMessagesTable).values({
        guildId: interaction.guild.id,
        channelId: channel.id,
        content,
        createdBy: interaction.user.id,
    }).onConflictDoUpdate({
        target: [stickyMessagesTable.guildId, stickyMessagesTable.channelId],
        set: { content, lastMessageId: null, enabled: true, createdBy: interaction.user.id, createdAt: new Date() },
    });

    await interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("📌 Sticky Message Set")
            .addFields({ name: "Channel", value: channel.toString(), inline: true })
            .setDescription(content.length > 300 ? content.slice(0, 300) + "…" : content)
            .setFooter({ text: "It will re-post itself after every new message in that channel" })],
        flags: 64,
    });

    try {
        const msg = await channel.send({ content: `📌 **Sticky:**\n${content}` });
        await db.update(stickyMessagesTable)
            .set({ lastMessageId: msg.id })
            .where(and(eq(stickyMessagesTable.guildId, interaction.guild.id), eq(stickyMessagesTable.channelId, channel.id)));
    } catch {
        // Not fatal — sticky will post naturally on next message
    }
}

async function handleRemove(interaction) {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const [row] = await db.select().from(stickyMessagesTable)
        .where(and(eq(stickyMessagesTable.guildId, interaction.guild.id), eq(stickyMessagesTable.channelId, channel.id)));

    if (!row) return interaction.reply({ content: `❌ No sticky message set for ${channel}.`, flags: 64 });

    if (row.lastMessageId) {
        await channel.messages.delete(row.lastMessageId).catch(() => {});
    }

    await db.delete(stickyMessagesTable)
        .where(and(eq(stickyMessagesTable.guildId, interaction.guild.id), eq(stickyMessagesTable.channelId, channel.id)));

    return interaction.reply({ content: `✅ Sticky message removed from ${channel}.`, flags: 64 });
}

async function handleList(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const stickies = await db.select().from(stickyMessagesTable)
        .where(and(eq(stickyMessagesTable.guildId, interaction.guild.id), eq(stickyMessagesTable.enabled, true)));

    if (stickies.length === 0) return interaction.reply({ content: "No sticky messages set in this server.", flags: 64 });

    const lines = stickies.map((s) =>
        `<#${s.channelId}> — ${s.content.slice(0, 60)}${s.content.length > 60 ? "…" : ""}`
    );
    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`📌 Sticky Messages (${stickies.length})`)
            .setDescription(lines.join("\n").slice(0, 4000))],
        flags: 64,
    });
}
