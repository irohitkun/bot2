import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { sendModLog, applyFooter } from "../utils/modLog.js";
import { isPremiumGuild, getPremiumTip } from "../utils/permissions.js";

export const data = new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((opt) => opt.setName("user").setDescription("The user to kick").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the kick").setRequired(false));

export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guild = interaction.guild;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ content: "❌ Could not find that member in the server.", flags: 64 });
    if (!member.kickable) return interaction.reply({ content: "❌ I cannot kick this user — they may have a higher role than me.", flags: 64 });
    if (member.id === interaction.user.id) return interaction.reply({ content: "❌ You cannot kick yourself.", flags: 64 });

    // DM before kicking so the message can be delivered while they're still reachable
    const dmEmbed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle("👟 You have been kicked")
        .addFields(
            { name: "Server", value: guild.name, inline: true },
            { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Reason", value: reason },
        )
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({ text: "You can rejoin the server if you have an invite link." })
        .setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => {});

    await member.kick(reason);

    const [style, premium] = await Promise.all([getGuildStyle(guild.id), isPremiumGuild(guild.id)]);

    const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle("👟 Member Kicked")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Reason", value: reason },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

    applyFooter(embed, style, premium ? "" : getPremiumTip("moderation"));
    await interaction.reply({ embeds: [embed] });
    await sendModLog(guild, new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle("👟 Member Kicked")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Reason", value: reason },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp()
    );
}
