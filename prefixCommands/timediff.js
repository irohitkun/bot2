import { EmbedBuilder } from "discord.js";

function parseTimeInput(input) {
    if (!input) return Date.now();
    input = input.trim();

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

export const command = {
    name: "timediff",
    aliases: ["td", "tdiff", "elapsed"],
    usage: "%timediff <from> [to]  — e.g. %timediff 3d ago  |  %timediff 2025-01-01 2025-06-01",
    description: "Calculate the time difference between two points in time",
    async execute(message, args) {
        if (args.length === 0) {
            return void message.reply(
                "**Usage:**\n" +
                "`%timediff <from>` — time since *from* until now\n" +
                "`%timediff <from> | <to>` — time between *from* and *to*\n\n" +
                "**Accepted formats:** `<t:1234567890>`, unix timestamp, `3d ago`, `in 2h`, `2025-01-15`, `Jan 15 2025`"
            );
        }

        // Split on " | " to allow two arguments with spaces
        const joined = args.join(" ");
        const [fromRaw, toRaw] = joined.split(/\s*\|\s*/);

        const fromMs = parseTimeInput(fromRaw?.trim() ?? "");
        const toMs = parseTimeInput(toRaw?.trim() ?? null);

        if (fromMs === null) {
            return void message.reply(`❌ Couldn't parse time: \`${fromRaw}\`\nUse: unix timestamp, \`3d ago\`, \`2025-01-15\`, or a Discord \`<t:UNIX>\` tag.`);
        }
        if (toMs === null) {
            return void message.reply(`❌ Couldn't parse time: \`${toRaw}\`\nUse: unix timestamp, \`3d ago\`, \`2025-01-15\`, or a Discord \`<t:UNIX>\` tag.`);
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

        return void message.reply({ embeds: [embed] });
    },
};
