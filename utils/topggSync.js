/**
 * Top.gg Command Sync
 * -------------------
 * Reads every slash command from the commands/ directory and POSTs them to
 * the Top.gg Commands API so they appear in the "Commands" tab on the bot's
 * Top.gg profile page.
 *
 * Requires:  TOPGG_TOKEN  (your Top.gg API token — different from
 *            TOPGG_WEBHOOK_SECRET).  Find it in top.gg → Your Bot → Webhooks
 *            → "API Token" at the very top of the page.
 *
 * Safe to call on every startup — Top.gg replaces the full list each time.
 */

import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Human-readable categories for each command name (shown on the Top.gg page)
const CATEGORIES = {
    // Moderation
    ban: "Moderation", tempban: "Moderation", unban: "Moderation",
    kick: "Moderation", mute: "Moderation", unmute: "Moderation",
    warn: "Moderation", warnings: "Moderation", clearwarn: "Moderation",
    purge: "Moderation", lock: "Moderation", unlock: "Moderation",
    lockdown: "Moderation", slowmode: "Moderation", jail: "Moderation",
    history: "Moderation", masstimeout: "Moderation", antinuke: "Moderation",
    nuke: "Moderation",

    // Server Management
    channel: "Management", role: "Management", massrole: "Management",
    ticket: "Management", reactionroles: "Management", automod: "Management",
    logs: "Management", welcome: "Management", setprefix: "Management",
    noprefix: "Management", customize: "Management", setupcheck: "Management",
    verification: "Management", sticky: "Management",

    // Utility
    remind: "Utility", afk: "Utility", snipe: "Utility", embed: "Utility",
    embedtemplate: "Utility", tag: "Utility", customcmd: "Utility",
    translate: "Utility", math: "Utility", color: "Utility",
    note: "Utility", timediff: "Utility", schedule: "Utility",
    msgcount: "Utility",

    // Info
    help: "Info", botinfo: "Info", serverinfo: "Info", userinfo: "Info",
    avatar: "Info", banner: "Info", ping: "Info", invite: "Info",
    features: "Info", changelog: "Info",

    // Economy & Levels
    profile: "Economy", rank: "Economy", daily: "Economy",
    leaderboard: "Economy", vote: "Economy",

    // Premium & AI
    ai: "AI / Premium", ailog: "AI / Premium", premium: "AI / Premium",
    premiumadmin: "AI / Premium", freetrial: "AI / Premium", perks: "AI / Premium",

    // Fun
    "8ball": "Fun", coinflip: "Fun", dice: "Fun",

    // Community
    giveaway: "Community", poll: "Community", birthday: "Community",
    confession: "Community",

    // Voice
    j2c: "Voice", j2cpanel: "Voice",

    // Starboard
    starboard: "Starboard",
};

export async function syncTopggCommands(botId) {
    const token = process.env.TOPGG_TOKEN?.trim();
    if (!token) {
        console.log("[TopGG Sync] TOPGG_TOKEN not set — skipping Top.gg command sync. Add it to sync your commands to the Top.gg Commands tab.");
        return;
    }

    // Dynamically load every command file and extract name + description
    const commandsPath = resolve(__dirname, "../commands");
    let commandFiles;
    try {
        commandFiles = readdirSync(commandsPath).filter(f => f.endsWith(".js") || f.endsWith(".ts"));
    } catch (e) {
        console.warn("[TopGG Sync] Could not read commands directory:", e.message);
        return;
    }

    const commands = [];
    for (const file of commandFiles) {
        try {
            const mod = await import(pathToFileURL(resolve(commandsPath, file)).href + `?cacheBust=${Date.now()}`);
            if (!mod.data) continue;
            const json = mod.data.toJSON?.() ?? mod.data;
            if (!json?.name) continue;

            // Top.gg accepts: name, description, type (1 = CHAT_INPUT slash command)
            const entry = {
                name: json.name,
                description: (json.description || "No description provided").slice(0, 100),
                type: json.type ?? 1,
            };

            const category = CATEGORIES[json.name];
            if (category) entry.category = category;

            commands.push(entry);
        } catch {
            // Skip commands that fail to import (usually missing optional deps)
        }
    }

    if (commands.length === 0) {
        console.warn("[TopGG Sync] No commands found to sync.");
        return;
    }

    // Sort alphabetically within each category for a clean display
    commands.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));

    try {
        const res = await fetch(`https://top.gg/api/bots/${botId}/commands`, {
            method: "POST",
            headers: {
                Authorization: token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(commands),
        });

        if (res.ok) {
            console.log(`[TopGG Sync] ✅ Synced ${commands.length} commands to Top.gg`);
        } else {
            const body = await res.text().catch(() => "(no body)");
            console.warn(`[TopGG Sync] Failed — HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
    } catch (err) {
        console.warn("[TopGG Sync] Network error:", err.message);
    }
}
