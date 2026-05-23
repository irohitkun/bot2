import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

/**
 * Parse a user-supplied time string into a unix timestamp (ms).
 * Accepts: Discord <t:UNIX>, plain unix seconds/ms, relative "3d ago / in 2h",
 *          ISO dates "2025-01-15", natural dates "Jan 15 2025".
 * Returns null if unparseable.
 */
function parseTimeInput(input) {
    if (!input) return Date.now();
    input = input.trim();

    // Discord timestamp  <t:1234567890>  or  <t:1234567890:R>
    const discordMatch = input.match(/^<t:(\d+)(?::[RrDdFfTt])?>$/);
    if (discordMatch) return parseInt(discordMatch[1], 10) * 1000;

    // Plain unix seconds (10 digits) or ms (13 digits)
    if (/^\d{10}$/.test(input)) return parseInt(input, 10) * 1000;
    if (/^\d{13}$/.test(input)) return parseInt(input, 10);

    // Relative:  "3d ago"  |  "2h ago"  |  "in 30m"  |  "5w"
    const relMatch = input.match(/^(?:in\s+)?(\d+)\s*(s|sec|m|min|h|hr|d|day|w|wk|mo|month|y|yr)s?\s*(ago)?$/i);
    if (relMatch) {
        const val = parseInt(relMatch[1], 10);
        const unit = relMatch[2].toLowerCase();
        const multipliers = {
            s: 1e3, sec: 1e3,
            m: 6e4, min: 6e4,
            h: 36e5, hr: 36e5,
            d: 864e5, day: 864e5,
            w: 6048e5, wk: 6048e5,
            mo: 2629746e3, month: 2629746e3,
            y: 31557600e3, yr: 31557600e3,
        };
        const delta = val * (multipliers[unit] ?? 0);
        return relMatch[3] ? Date.now() - delta : Date.now() + delta;
    }

    // Fallback to JS Date.parse (handles ISO 8601 and many natural formats)
    const parsed = Date.parse(input);
    if (!isNaN(parsed)) return parsed;

    return null;
}

function formatDuration(totalMs) {
    const abs = Math.abs(totalMs);
    const s = Math.floor(abs / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const mo = Math.floor(d / 30.44);
    const y = Math.floor(d / 365.25);

    const parts = [];
    if (y > 0) { parts.push(`${y}y`); if (mo % 12) parts.push(`${mo % 12}mo`); }
    else if (mo > 0) { parts.push(`${mo}mo`); if (d % 30) parts.push(`${Math.round(d % 30.44)}d`); }
    else if (d > 0) { parts.push(`${d}d`); if (h % 24) parts.push(`${h % 24}h`); if (m % 60) parts.push(`${m % 60}m`); }
    else if (h > 0) { parts.push(`${h}h`); if (m % 60) parts.push(`${m % 60}m`); if (s % 60) parts.push(`${s % 60}s`); }
    else if (m > 0) { parts.push(`${m}m`); if (s % 60) parts.push(`${s % 60}s`); }
    else parts.push(`${s}s`);

    return parts.join(" ") || "0s";
}

export const data = new SlashCommandBuilder()
    .setName("timediff")
    .setDescription("Calculate the time difference between two points in time")
    .addStringOption((o) =>
        o.setName("from")
            .setDescription("Start time — Discord <t:UNIX>, unix timestamp, '3d ago', 'Jan 1 2025', ISO date…")
            .setRequired(true)
    )
    .addStringOption((o) =>
        o.setName("to")
            .setDescription("End time (same formats — defaults to now)")
            .setRequired(false)
    );

export async function execute(interaction) {
    const fromRaw = interaction.options.getString("from", true);
    const toRaw = interaction.options.getString("to") ?? null;

    const fromMs = parseTimeInput(fromRaw);
    const toMs = parseTimeInput(toRaw);

    if (fromMs === null) {
        return interaction.reply({ content: `❌ Couldn't parse \`from\` time: \`${fromRaw}\`\n**Accepted formats:** \`<t:1234567890>\`, unix timestamp, \`3d ago\`, \`in 2h\`, \`2025-01-15\`, \`Jan 15 2025\``, flags: 64 });
    }
    if (toMs === null) {
        return interaction.reply({ content: `❌ Couldn't parse \`to\` time: \`${toRaw}\`\n**Accepted formats:** same as \`from\``, flags: 64 });
    }

    const diffMs = toMs - fromMs;
    const isFuture = diffMs > 0;
    const fromSec = Math.floor(fromMs / 1000);
    const toSec = Math.floor(toMs / 1000);

    const embed = new EmbedBuilder()
        .setColor(isFuture ? 0x5865f2 : 0xf1c40f)
        .setTitle("⏱️ Time Difference")
        .addFields(
            { name: "From", value: `<t:${fromSec}:F>  (<t:${fromSec}:R>)`, inline: false },
            { name: toRaw ? "To" : "To (now)", value: `<t:${toSec}:F>  (<t:${toSec}:R>)`, inline: false },
            { name: "Difference", value: `**${formatDuration(diffMs)}** ${isFuture ? "later" : "earlier"}`, inline: true },
            { name: "Exact ms", value: `${Math.abs(diffMs).toLocaleString()} ms`, inline: true },
        )
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}
