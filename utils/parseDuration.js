/**
 * Parse a human-readable duration string into milliseconds.
 * Supports: s, m, h, d, w (seconds, minutes, hours, days, weeks).
 * Examples: "30s" → 30000, "10m" → 600000, "2h" → 7200000, "7d" → 604800000, "2w" → 1209600000
 * Returns null if the string is invalid or zero.
 */
export function parseDuration(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    const match = s.match(/^(\d+(?:\.\d+)?)\s*([smhdw]?)$/);
    if (!match) return null;
    const n = parseFloat(match[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = match[2] || "m";
    const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    return Math.round(n * (multipliers[unit] ?? 60_000));
}

/**
 * Format milliseconds into a human-readable string.
 * e.g. 90000 → "1m 30s", 7200000 → "2h", 604800000 → "7d"
 */
export function formatDuration(ms) {
    if (!ms || ms <= 0) return "0s";
    const parts = [];
    const weeks  = Math.floor(ms / 604_800_000); ms %= 604_800_000;
    const days   = Math.floor(ms / 86_400_000);  ms %= 86_400_000;
    const hours  = Math.floor(ms / 3_600_000);   ms %= 3_600_000;
    const mins   = Math.floor(ms / 60_000);       ms %= 60_000;
    const secs   = Math.floor(ms / 1_000);
    if (weeks)  parts.push(`${weeks}w`);
    if (days)   parts.push(`${days}d`);
    if (hours)  parts.push(`${hours}h`);
    if (mins)   parts.push(`${mins}m`);
    if (secs && !weeks && !days) parts.push(`${secs}s`);
    return parts.join(" ") || "0s";
}
