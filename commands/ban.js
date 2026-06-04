import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { sendModLog, applyFooter } from "../utils/modLog.js";
import { isPremiumGuild, getPremiumTip } from "../utils/permissions.js";

export const data = new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server (works even if they're not here)")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) => opt.setName("user").setDescription("The user to ban").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the ban").setRequired(false))
    .addIntegerOption((opt) =>
        opt.setName("delete_days")
            .setDescription("Number of days of messages to delete (0-7)")
            .setMinValue(0)
            .setMaxValue(7)
            .setRequired(false)
    );

export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const guild = interaction.guild;
    const mod = interaction.user;

    if (target.id === mod.id) {
        return interaction.reply({ content: "❌ You cannot ban yourself.", flags: 64 });
    }
    if (target.id === interaction.client.user.id) {
        return interaction.reply({ content: "❌ I cannot ban myself.", flags: 64 });
    }

    // Check if user is already banned
    const existingBan = await guild.bans.fetch(target.id).catch(() => null);
    if (existingBan) {
        return interaction.reply({ content: `❌ **${target.tag}** is already banned from this server.`, flags: 64 });
    }

    // Fetch member — null means they're not in the server (hackban)
    const member = await guild.members.fetch(target.id).catch(() => null);

    if (member) {
        if (!member.bannable) {
            return interaction.reply({ content: "❌ I cannot ban this user — they may have a higher role than me.", flags: 64 });
        }
        if (member.roles.highest.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ content: "❌ That user's highest role is equal to or above mine.", flags: 64 });
        }
    }

    await interaction.deferReply();

    const [style, premium] = await Promise.all([getGuildStyle(guild.id), isPremiumGuild(guild.id)]);

    // DM the user before banning (only possible if they're in the server)
    if (member) {
        const dmEmbed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔨 You have been banned")
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: "Server", value: guild.name, inline: true },
                { name: "Moderator", value: `${mod.tag}`, inline: true },
                { name: "Reason", value: reason },
            )
            .setFooter({ text: "If you believe this is a mistake, contact the server staff." })
            .setTimestamp();
        await target.send({ embeds: [dmEmbed] }).catch(() => {});
    }

    // Execute the ban (works for both members and non-members)
    try {
        await guild.bans.create(target.id, {
            deleteMessageSeconds: deleteDays * 86400,
            reason: `${mod.tag}: ${reason}`,
        });
    } catch (err) {
        return interaction.editReply({ content: `❌ Failed to ban user: ${err.message}` });
    }

    const wasInServer = member !== null;

    const confirmEmbed = new EmbedBuilder()
        .setColor(style.color)
        .setTitle("🔨 User Banned")
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setDescription(wasInServer ? null : "⚠️ This user was not in the server — ban applied by ID.")
        .addFields(
            { name: "User", value: `${target.tag}\n<@${target.id}> (${target.id})`, inline: true },
            { name: "Moderator", value: `${mod.tag}\n<@${mod.id}>`, inline: true },
            { name: "Reason", value: reason },
            { name: "Messages Deleted", value: `${deleteDays} day(s)`, inline: true },
            { name: "Was in Server", value: wasInServer ? "Yes" : "No (hackban)", inline: true },
        )
        .setTimestamp();

    applyFooter(confirmEmbed, style, premium ? "" : getPremiumTip("moderation"));
    await interaction.editReply({ embeds: [confirmEmbed] });

    const logEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔨 User Banned")
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: "User", value: `${target.tag}\n<@${target.id}> (${target.id})`, inline: true },
            { name: "Moderator", value: `${mod.tag}\n<@${mod.id}>`, inline: true },
            { name: "Reason", value: reason },
            { name: "Messages Deleted", value: `${deleteDays} day(s)`, inline: true },
            { name: "Was in Server", value: wasInServer ? "Yes" : "No (hackban)", inline: true },
        )
        .setTimestamp();

    await sendModLog(guild, logEmbed);
}
