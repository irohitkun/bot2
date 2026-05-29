import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { sendModLog, applyFooter } from "../utils/modLog.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { parseDuration, formatDuration } from "../utils/parseDuration.js";
import { scheduleSlowmodeRemoval } from "../utils/slowmodeScheduler.js";
import { db, slowmodeTimersTable } from "../db/index.js";
import { eq } from "drizzle-orm";

const MAX_SLOWMODE_SECONDS = 21600; // Discord's hard cap (6 hours)

export const data = new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode for a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((opt) => opt
        .setName("duration")
        .setDescription("Delay between messages — e.g. 30s, 5m, 1h — or 0 to disable")
        .setRequired(true))
    .addChannelOption((opt) => opt.setName("channel").setDescription("Target channel (defaults to current)").setRequired(false))
    .addStringOption((opt) => opt.setName("expire").setDescription("Auto-remove slowmode after this long — e.g. 30m, 2h, 1d").setRequired(false))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason for setting slowmode").setRequired(false));

export async function execute(interaction) {
    const durationStr = interaction.options.getString("duration", true).trim();
    const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
    const expireStr = interaction.options.getString("expire");
    const reason = interaction.options.getString("reason") ?? "Slowmode set by moderator";
    const guild = interaction.guild;

    const me = guild.members.me;
    if (!targetChannel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: "❌ I don't have permission to manage that channel.", flags: 64 });
    }

    // Parse duration — allow "0" or "off" as a disable shorthand
    let seconds;
    if (durationStr === "0" || durationStr.toLowerCase() === "off") {
        seconds = 0;
    } else {
        const ms = parseDuration(durationStr);
        if (!ms) return interaction.reply({ content: "❌ Invalid duration. Examples: `30s`, `5m`, `1h`, or `0` to disable.", flags: 64 });
        seconds = Math.round(ms / 1000);
        if (seconds > MAX_SLOWMODE_SECONDS) {
            return interaction.reply({ content: `❌ Maximum slowmode is 6 hours (21600 seconds). You entered \`${formatDuration(ms)}\`.`, flags: 64 });
        }
    }

    // Parse optional auto-expire
    let expireMs = null;
    if (expireStr && seconds > 0) {
        expireMs = parseDuration(expireStr);
        if (!expireMs) return interaction.reply({ content: "❌ Invalid expire duration. Examples: `30m`, `2h`, `1d`.", flags: 64 });
    }

    try {
        await targetChannel.setRateLimitPerUser(seconds, reason);
    } catch (err) {
        return interaction.reply({ content: `❌ Failed to set slowmode: ${err.message}`, flags: 64 });
    }

    // Cancel any existing auto-expire for this channel
    await db.delete(slowmodeTimersTable)
        .where(eq(slowmodeTimersTable.channelId, targetChannel.id))
        .catch(() => {});

    const slowmodeLabel = seconds === 0 ? "Disabled" : formatDuration(seconds * 1000);
    let expireLabel = "";

    if (expireMs && seconds > 0) {
        const expiresAt = new Date(Date.now() + expireMs);
        const [row] = await db.insert(slowmodeTimersTable).values({
            guildId: guild.id,
            channelId: targetChannel.id,
            expiresAt,
        }).returning();
        scheduleSlowmodeRemoval(interaction.client, row, expireMs);
        expireLabel = `\nAuto-removed <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`;
    }

    const style = await getGuildStyle(guild.id);
    const embed = new EmbedBuilder()
        .setColor(seconds === 0 ? 0x57f287 : 0x5865f2)
        .setTitle(seconds === 0 ? "⏩ Slowmode Disabled" : "⏱️ Slowmode Set")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Slowmode", value: slowmodeLabel, inline: true },
            { name: "Set By", value: interaction.user.tag, inline: true },
            { name: "Reason", value: reason + expireLabel },
        )
        .setTimestamp();
    applyFooter(embed, style);
    await interaction.reply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(seconds === 0 ? 0x57f287 : 0x5865f2)
        .setTitle(seconds === 0 ? "⏩ Slowmode Disabled" : "⏱️ Slowmode Set")
        .addFields(
            { name: "Channel", value: targetChannel.toString(), inline: true },
            { name: "Slowmode", value: slowmodeLabel, inline: true },
            { name: "Set By", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Reason", value: reason + expireLabel },
        )
        .setTimestamp()
    );
}
