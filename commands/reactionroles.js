import {
    SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
} from "discord.js";
import { db } from "../db/index.js";
import { reactionRolesTable } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";

const FREE_REACTION_ROLE_LIMIT = 5;

export const data = new SlashCommandBuilder()
    .setName("reactionroles")
    .setDescription("Set up reaction roles for a message")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
        sub.setName("add")
            .setDescription("Add a reaction role to a message")
            .addStringOption((opt) =>
                opt.setName("message_id")
                    .setDescription("The ID of the message to add the reaction role to")
                    .setRequired(true))
            .addStringOption((opt) =>
                opt.setName("emoji")
                    .setDescription("The emoji to react with (e.g. ✅ or custom emoji)")
                    .setRequired(true))
            .addRoleOption((opt) =>
                opt.setName("role")
                    .setDescription("The role to assign when someone reacts")
                    .setRequired(true))
            .addChannelOption((opt) =>
                opt.setName("channel")
                    .setDescription("The channel the message is in (defaults to current channel)")
                    .setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("remove")
            .setDescription("Remove a reaction role from a message")
            .addStringOption((opt) =>
                opt.setName("message_id")
                    .setDescription("The message ID")
                    .setRequired(true))
            .addStringOption((opt) =>
                opt.setName("emoji")
                    .setDescription("The emoji to remove")
                    .setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("List all reaction roles in this server"))
    .addSubcommand((sub) =>
        sub.setName("clear")
            .setDescription("Remove all reaction roles from a specific message")
            .addStringOption((opt) =>
                opt.setName("message_id")
                    .setDescription("The message ID")
                    .setRequired(true)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "add") return handleAdd(interaction);
    if (sub === "remove") return handleRemove(interaction);
    if (sub === "list") return handleList(interaction);
    if (sub === "clear") return handleClear(interaction);
}

async function handleAdd(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const messageId = interaction.options.getString("message_id", true).trim();
    const emoji = interaction.options.getString("emoji", true).trim();
    const role = interaction.options.getRole("role", true);
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;

    // Enforce free tier limit
    const premium = await isPremiumGuild(guild.id);
    if (!premium) {
        const existing = await db.select().from(reactionRolesTable).where(eq(reactionRolesTable.guildId, guild.id));
        if (existing.length >= FREE_REACTION_ROLE_LIMIT) {
            return interaction.editReply({
                embeds: [premiumDeniedEmbed(`Reaction Roles (free limit: ${FREE_REACTION_ROLE_LIMIT})`).setDescription(
                    `You have reached the **${FREE_REACTION_ROLE_LIMIT} reaction role** limit for free servers.\n\n` +
                    `Upgrade to **Premium** for unlimited reaction roles. Use \`/premium\` to get started.`,
                )],
            });
        }
    }

    // Validate bot can assign this role
    const botMember = await guild.members.fetchMe();
    if (role.position >= botMember.roles.highest.position) {
        return interaction.editReply({ content: "❌ I cannot assign that role — it is higher than or equal to my highest role." });
    }
    if (role.managed) {
        return interaction.editReply({ content: "❌ That role is managed by an integration and cannot be assigned." });
    }

    // Fetch the message
    let targetMessage;
    try {
        targetMessage = await channel.messages.fetch(messageId);
    } catch {
        return interaction.editReply({ content: `❌ Could not find a message with ID \`${messageId}\` in <#${channel.id}>.` });
    }

    // Add the reaction to the message
    try {
        await targetMessage.react(emoji);
    } catch {
        return interaction.editReply({ content: `❌ Could not react with that emoji. Make sure it is valid and I have permission to react in <#${channel.id}>.` });
    }

    // Save to DB
    await db.insert(reactionRolesTable).values({
        guildId: guild.id,
        channelId: channel.id,
        messageId,
        emoji,
        roleId: role.id,
        createdBy: interaction.user.id,
    }).onConflictDoUpdate({
        target: [reactionRolesTable.messageId, reactionRolesTable.emoji],
        set: { roleId: role.id, createdBy: interaction.user.id, channelId: channel.id },
    });

    const { color } = await getGuildStyle(guild.id);
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("✅ Reaction Role Added")
        .addFields(
            { name: "Message", value: `[Jump to message](${targetMessage.url})`, inline: true },
            { name: "Emoji", value: emoji, inline: true },
            { name: "Role", value: `<@&${role.id}>`, inline: true },
        )
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function handleRemove(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const messageId = interaction.options.getString("message_id", true).trim();
    const emoji = interaction.options.getString("emoji", true).trim();

    const deleted = await db.delete(reactionRolesTable)
        .where(and(eq(reactionRolesTable.messageId, messageId), eq(reactionRolesTable.emoji, emoji)))
        .returning();

    if (deleted.length === 0) {
        return interaction.editReply({ content: "❌ No reaction role found for that message + emoji combination." });
    }

    return interaction.editReply({ content: `✅ Removed the reaction role for ${emoji} on message \`${messageId}\`.` });
}

async function handleList(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const { color } = await getGuildStyle(guild.id);

    const rows = await db.select().from(reactionRolesTable).where(eq(reactionRolesTable.guildId, guild.id));

    if (rows.length === 0) {
        return interaction.editReply({ content: "No reaction roles are set up in this server yet." });
    }

    const grouped = {};
    for (const row of rows) {
        if (!grouped[row.messageId]) grouped[row.messageId] = [];
        grouped[row.messageId].push(row);
    }

    const lines = Object.entries(grouped).map(([msgId, entries]) => {
        const channel = `<#${entries[0].channelId}>`;
        const roles = entries.map((e) => `${e.emoji} → <@&${e.roleId}>`).join(", ");
        return `**Message \`${msgId}\`** in ${channel}\n${roles}`;
    });

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎭 Reaction Roles (${rows.length})`)
        .setDescription(lines.join("\n\n").slice(0, 4000))
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function handleClear(interaction) {
    await interaction.deferReply({ flags: 64 });
    const messageId = interaction.options.getString("message_id", true).trim();

    const deleted = await db.delete(reactionRolesTable)
        .where(and(eq(reactionRolesTable.guildId, interaction.guild.id), eq(reactionRolesTable.messageId, messageId)))
        .returning();

    if (deleted.length === 0) {
        return interaction.editReply({ content: "❌ No reaction roles found for that message." });
    }

    return interaction.editReply({ content: `✅ Removed all ${deleted.length} reaction role(s) from message \`${messageId}\`.` });
}
