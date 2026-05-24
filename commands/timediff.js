import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

// ── Snowflake → millisecond timestamp ─────────────────────────────────────────
function snowflakeToMs(id) {
    return Number((BigInt(id) >> 22n) + 1420070400000n);
}
function isSnowflake(input) {
    return /^\d{17,19}$/.test(input.trim());
}

// ── Generic time parser (for non-snowflake inputs) ────────────────────────────
function parseTimeInput(input) {
    input = input.trim();
    if (isSnowflake(input)) return snowflakeToMs(input);
    const discordMatch = input.match(/^<t:(\d+)(?::[RrDdFfTt])?>$/);
    if (discordMatch) return parseInt(discordMatch[1], 10) * 1000;
    if (/^\d{10}$/.test(input)) return parseInt(input, 10) * 1000;
    if (/^\d{13}$/.test(input)) return parseInt(input, 10);
    const relMatch = input.match(/^(?:in\s+)?(\d+)\s*(s|sec|m|min|h|hr|d|day|w|wk|mo|month|y|yr)s?\s*(ago)?$/i);
    if (relMatch) {
        const val = parseInt(relMatch[1], 10);
        const unit = relMatch[2].toLowerCase();
        const multipliers = {
            s: 1e3, sec: 1e3, m: 6e4, min: 6e4, h: 36e5, hr: 36e5,
            d: 864e5, day: 864e5, w: 6048e5, wk: 6048e5,
            mo: 2629746e3, month: 2629746e3, y: 31557600e3, yr: 31557600e3,
        };
        const delta = val * (multipliers[unit] ?? 0);
        return relMatch[3] ? Date.now() - delta : Date.now() + delta;
    }
    const parsed = Date.parse(input);
    if (!isNaN(parsed)) return parsed;
    return null;
}

// ── Human-friendly duration string ───────────────────────────────────────────
function formatDuration(totalMs) {
    const abs = Math.abs(totalMs);
    const secs = Math.floor(abs / 1000) % 60;
    const mins = Math.floor(abs / 60000) % 60;
    const hrs = Math.floor(abs / 3600000) % 24;
    const days = Math.floor(abs / 86400000);
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
    if (hrs > 0) parts.push(`${hrs} hour${hrs !== 1 ? "s" : ""}`);
    if (mins > 0) parts.push(`${mins} minute${mins !== 1 ? "s" : ""}`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} second${secs !== 1 ? "s" : ""}`);
    return parts.join(", ");
}

// ── Describe a point in time for the embed ────────────────────────────────────
function describePoint(raw, ms, label) {
    const sec = Math.floor(ms / 1000);
    const isId = isSnowflake(raw ?? "");
    return {
        name: isId ? `Message \`${raw}\`` : label,
        value: `Sent <t:${sec}:F>`,
        footer: isId ? `ID: ${raw}` : null,
    };
}

export const data = new SlashCommandBuilder()
    .setName("timediff")
    .setDescription("Time difference between two message IDs, timestamps, or dates")
    .addStringOption((o) =>
        o.setName("first")
            .setDescription("Message ID, unix timestamp, '<t:UNIX>', '3d ago', '2025-01-15'…")
            .setRequired(true)
    )
    .addStringOption((o) =>
        o.setName("second")
            .setDescription("Second message ID or time — defaults to now (the moment you run the command)")
            .setRequired(false)
    );

export async function execute(interaction) {
    const firstRaw = interaction.options.getString("first", true).trim();
    const secondRaw = interaction.options.getString("second")?.trim() ?? null;

    const firstMs = parseTimeInput(firstRaw);
    if (firstMs === null)
        return interaction.reply({ content: `❌ Couldn't parse: \`${firstRaw}\`\n**Accepted:** message ID, unix timestamp, \`<t:UNIX>\`, \`3d ago\`, \`2025-01-15\``, flags: 64 });

    const secondMs = secondRaw ? parseTimeInput(secondRaw) : interaction.createdTimestamp;
    if (secondMs === null)
        return interaction.reply({ content: `❌ Couldn't parse: \`${secondRaw}\``, flags: 64 });

    const diffMs = secondMs - firstMs;
    const firstSec = Math.floor(firstMs / 1000);
    const secondSec = Math.floor(secondMs / 1000);

    const firstIsId = isSnowflake(firstRaw);
    const secondIsId = secondRaw && isSnowflake(secondRaw);

    let footerText;
    if (firstIsId && secondIsId) footerText = "Showing difference between the two message IDs";
    else if (firstIsId && !secondRaw) footerText = "Showing difference between given ID and command message";
    else if (firstIsId) footerText = "Showing difference between given ID and second time";
    else footerText = "Showing time difference";

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Time Difference")
        .setDescription(`**${formatDuration(diffMs)}**${diffMs < 0 ? " (first is after second)" : ""}`)
        .addFields(
            {
                name: firstIsId ? `Message \`${firstRaw}\`` : "First",
                value: `Sent <t:${firstSec}:F>`,
                inline: false,
            },
            {
                name: secondIsId ? `Message \`${secondRaw}\`` : (secondRaw ? "Second" : "Now"),
                value: `Sent <t:${secondSec}:F>`,
                inline: false,
            },
        )
        .setFooter({ text: footerText })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}
