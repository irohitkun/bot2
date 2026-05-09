import {
    SlashCommandBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits,
} from "discord.js";
import { db, j2cTempChannelsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("j2cpanel")
    .setDescription("Open the control panel for your Join-to-Create temporary voice channel");

export async function execute(interaction) {
    const member = interaction.member;
    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
        return interaction.reply({ content: "❌ You must be in a voice channel to use this.", flags: 64 });
    }

    const [temp] = await db.select().from(j2cTempChannelsTable)
        .where(eq(j2cTempChannelsTable.channelId, voiceChannel.id));

    if (!temp) {
        return interaction.reply({ content: "❌ You are not in a J2C temporary channel. Join a hub first.", flags: 64 });
    }

    if (temp.ownerId !== interaction.user.id) {
        return interaction.reply({
            content: `❌ Only <@${temp.ownerId}> (the channel owner) can open the control panel.`,
            flags: 64,
        });
    }

    const { color } = await getGuildStyle(interaction.guild.id);
    return interaction.reply(buildPanelPayload(voiceChannel, color));
}

export function buildPanelPayload(channel, color) {
    const locked = channel.permissionOverwrites.cache
        .get(channel.guild.roles.everyone.id)
        ?.deny?.has(PermissionFlagsBits.Connect) ?? false;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎙️ Your Channel — ${channel.name}`)
        .addFields(
            { name: "👥 Members", value: `${channel.members.size}${channel.userLimit ? `/${channel.userLimit}` : ""}`, inline: true },
            { name: "🔒 Status", value: locked ? "Locked" : "Unlocked", inline: true },
            { name: "📶 Bitrate", value: `${Math.round(channel.bitrate / 1000)}kbps`, inline: true },
        )
        .setDescription("Use the buttons below to manage your temporary voice channel.")
        .setFooter({ text: "Only the channel owner can use these controls." })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("j2c:rename")
            .setLabel("Rename")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("j2c:setlimit")
            .setLabel("Set Limit")
            .setEmoji("👥")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(locked ? "j2c:unlock" : "j2c:lock")
            .setLabel(locked ? "Unlock" : "Lock")
            .setEmoji(locked ? "🔓" : "🔒")
            .setStyle(locked ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("j2c:kick")
            .setLabel("Kick User")
            .setEmoji("👢")
            .setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("j2c:transfer")
            .setLabel("Transfer Ownership")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("j2c:delete")
            .setLabel("Delete Channel")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger),
    );

    return { embeds: [embed], components: [row1, row2], flags: 64 };
}
