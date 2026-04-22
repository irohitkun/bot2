// Compound duration parser. Accepts strings like:
//   "10m", "2h", "1d", "1d12h30m", "90m", "2h30s"
// Units: s (seconds), m (minutes), h (hours), d (days). Case-insensitive.
// Returns total milliseconds, or null if the string is empty/invalid.
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

export function parseDuration(input) {
    if (!input || typeof input !== "string") return null;
    const cleaned = input.trim().toLowerCase();
    if (!cleaned) return null;

    // Must consist entirely of <number><unit> pairs with nothing else.
    if (!/^(\d+[smhd])+$/.test(cleaned)) return null;

    let total = 0;
    for (const match of cleaned.matchAll(/(\d+)([smhd])/g)) {
        total += parseInt(match[1], 10) * UNIT_MS[match[2]];
    }
    return total > 0 ? total : null;
}

export function formatDuration(ms) {
    if (ms <= 0) return "0s";
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const parts = [];
    if (days) parts.push(days + "d");
    if (hours) parts.push(hours + "h");
    if (minutes) parts.push(minutes + "m");
    if (seconds && !days && !hours) parts.push(seconds + "s");
    return parts.join(" ") || "0s";
}
