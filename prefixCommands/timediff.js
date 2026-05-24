import { EmbedBuilder } from "discord.js";

function snowflakeToMs(id) {
    return Number((BigInt(id) >> 22n) + 1420070400000n);
}
function isSnowflake(input) {
    return /^\d{17,19}$/.test((input ?? "").trim());
}

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

export const command = {
    name: "timediff",
    aliases: ["td", "tdiff", "elapsed"],
    usage: [
        "%timediff <messageID>              — when it was sent vs now",
        "%timediff <messageID1> <messageID2> — diff between two messages",
        "%timediff <messageID> | <time>     — diff between message and any time",
        "%timediff 3d ago                   — diff from 3 days ago until now",
    ],
    description: "Calculate the time difference between two message IDs, timestamps, or dates",
    async execute(message, args) {
        if (args.length === 0) {
            return void message.reply(
                "**Usage:**\n" +
                "`%timediff <messageID>` — when it was sent vs now\n" +
                "`%timediff <id1> <id2>` — diff between two message IDs\n" +
                "`%timediff <from> | <to>` — any two times (IDs, unix, `3d ago`, dates)\n\n" +
                "**Examples:**\n" +
                "`%timediff 1507794891235786914`\n" +
                "`%timediff 1507794891235786914 1507795000000000000`\n" +
                "`%td 3d ago`"
            );
        }

        // Two adjacent snowflake-looking args → treat as two message IDs
        let firstRaw, secondRaw;
        if (args.length >= 2 && isSnowflake(args[0]) && isSnowflake(args[1])) {
            firstRaw = args[0];
            secondRaw = args[1];
        } else {
            // Allow pipe separator for multi-word times: "Jan 1 2025 | Jan 1 2026"
            const joined = args.join(" ");
            const parts = joined.split(/\s*\|\s*/);
            firstRaw = parts[0]?.trim();
            secondRaw = parts[1]?.trim() ?? null;
        }

        const firstMs = parseTimeInput(firstRaw);
        if (firstMs === null)
            return void message.reply(`❌ Couldn't parse: \`${firstRaw}\`\nAccepted: message ID, unix timestamp, \`<t:UNIX>\`, \`3d ago\`, \`2025-01-15\``);

        // Second defaults to the command invocation message timestamp
        const secondMs = secondRaw ? parseTimeInput(secondRaw) : message.createdTimestamp;
        if (secondMs === null)
            return void message.reply(`❌ Couldn't parse: \`${secondRaw}\``);

        const diffMs = secondMs - firstMs;
        const firstSec = Math.floor(firstMs / 1000);
        const secondSec = Math.floor(secondMs / 1000);
        const firstIsId = isSnowflake(firstRaw);
        const secondIsId = secondRaw && isSnowflake(secondRaw);

        let footerText;
        if (firstIsId && secondIsId) footerText = "Showing difference between the two message IDs";
        else if (firstIsId && !secondRaw) footerText = "Showing difference between given ID and command message ID";
        else if (firstIsId) footerText = "Showing difference between given ID and second time";
        else footerText = "Showing time difference";

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("Time Difference")
            .setDescription(`**${formatDuration(diffMs)}**${diffMs < 0 ? " (first is after second)" : ""}`)
            .addFields(
                {
                    name: firstIsId ? `${firstRaw}` : "First",
                    value: `Sent <t:${firstSec}:F>`,
                    inline: false,
                },
                {
                    name: secondIsId ? `${secondRaw}` : (secondRaw ? "Second" : "Now"),
                    value: `Sent <t:${secondSec}:F>`,
                    inline: false,
                },
            )
            .setFooter({ text: footerText })
            .setTimestamp();

        return void message.reply({ embeds: [embed] });
    },
};
