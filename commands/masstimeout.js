import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { parseDuration, formatDuration } from "../utils/parseDuration.js";
import { sendModLog } from "../utils/modLog.js";

export const data = new SlashCommandBuilder()
    .setName("masstimeout")
    .setDescription("Timeout multiple members at once — all humans, all bots, or members with a specific role")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((o) =>
        o.setName("duration")
            .setDescription("Timeout duration e.g. 10m, 1h, 1d (max 28 days)")
            .setRequired(true))
    .addStringOption((o) =>
        o.setName("target")
            .setDescription("Who to timeout")
            .setRequired(true)
            .addChoices(
                { name: "All humans", value: "humans" },
                { name: "Members with a specific role", value: "role" },
            ))
    .addRoleOption((o) => o.setName("role").setDescription("Role to filter by (required when target = role)").setRequired(false))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the mass timeout").setRequired(false));

export async function execute(interaction) {
    const durationStr = interaction.options.getString("duration", true);
    const target = interaction.options.getString("target", true);
    const role = interaction.options.getRole("role");
    const reason = interaction.options.getString("reason") ?? "Mass timeout by moderator";
    const guild = interaction.guild;

    if (target === "role" && !role) {
        return interaction.reply({ content: "❌ You must specify a role when targeting by role.", flags: 64 });
    }

    const ms = parseDuration(durationStr);
    if (!ms || ms < 10_000) {
        return interaction.reply({ content: "❌ Invalid duration. Examples: `10m`, `1h`, `1d`. Minimum: 10 seconds.", flags: 64 });
    }
    const MAX_MS = 28 * 24 * 60 * 60 * 1000;
    if (ms > MAX_MS) return interaction.reply({ content: "❌ Discord's maximum timeout is 28 days.", flags: 64 });

    await interaction.deferReply();

    let members;
    try {
        await guild.members.fetch();
        members = [...guild.members.cache.values()];
    } catch {
        return interaction.editReply("❌ Failed to fetch members. Ensure the bot has the Server Members Intent enabled.");
    }

    let filtered;
    if (target === "humans") {
        filtered = members.filter((m) => !m.user.bot && m.id !== guild.ownerId && m.id !== interaction.user.id && m.id !== interaction.client.user.id);
    } else {
        filtered = members.filter((m) => !m.user.bot && m.roles.cache.has(role.id) && m.id !== guild.ownerId && m.id !== interaction.user.id && m.id !== interaction.client.user.id);
    }

    const botMember = guild.members.me;
    filtered = filtered.filter((m) => m.roles.highest.position < botMember.roles.highest.position);

    if (filtered.length === 0) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle("⚠️ No Eligible Members").setDescription("No members matched the filter or all are protected.")] });
    }

    const label = formatDuration(ms);
    await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xf47b67).setTitle("⏳ Mass Timeout — Working…")
            .setDescription(`Applying **${label}** timeout to **${filtered.length}** members. This may take a moment…`)],
    });

    let success = 0;
    let failed = 0;
    const until = new Date(Date.now() + ms);
    const auditReason = `[MassTimeout: ${label}] ${reason} — by ${interaction.user.tag}`;

    for (const member of filtered) {
        try {
            await member.timeout(ms, auditReason);
            success++;
        } catch {
            failed++;
        }
        if (success % 5 === 0) await new Promise((r) => setTimeout(r, 300));
    }

    const targetLabel = target === "humans" ? "All humans" : `Members with <@&${role.id}>`;
    const { color } = await getGuildStyle(guild.id);

    const embed = new EmbedBuilder()
        .setColor(failed === 0 ? color : 0xfee75c)
        .setTitle("🔇 Mass Timeout — Done")
        .addFields(
            { name: "Target", value: targetLabel, inline: true },
            { name: "Duration", value: label, inline: true },
            { name: "Expires", value: `<t:${Math.floor(until.getTime() / 1000)}:R>`, inline: true },
            { name: "Succeeded", value: `${success}`, inline: true },
            { name: "Failed / Skipped", value: `${failed}`, inline: true },
            { name: "Reason", value: reason },
        )
        .setFooter({ text: `Executed by ${interaction.user.tag}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0xf47b67)
        .setTitle("🔇 Mass Timeout Executed")
        .addFields(
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Target", value: targetLabel, inline: true },
            { name: "Duration", value: label, inline: true },
            { name: "Applied To", value: `${success} members`, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp()
    );
}
