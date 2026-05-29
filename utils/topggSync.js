/**
 * Top.gg Command Sync
 * -------------------
 * Reads every slash command from the commands/ directory and POSTs them to
 * the Top.gg Commands API so they appear in the "Commands" tab on the bot's
 * Top.gg profile page.
 *
 * Requires:  TOPGG_TOKEN  env var — your Top.gg API token.
 * Where to find it:  top.gg Dashboard → Your Bot → Edit → scroll to the very
 *   top → "Token" (click to reveal). This is NOT the webhook secret.
 *
 * Safe to call on every startup — Top.gg replaces the full list each time.
 */

import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOPGG_API = "https://top.gg/api";

export async function syncTopggCommands(botId) {
    const token = process.env.TOPGG_TOKEN?.trim();
    if (!token) {
        console.log("[TopGG Sync] TOPGG_TOKEN not set — skipping. Get it from: top.gg → Your Bot → Edit → Token");
        return;
    }

    // Load all slash command definitions (name + description only — no extra fields)
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
        // Do NOT append query params to file:// URLs — Node.js doesn't support them
        const filePath = pathToFileURL(resolve(commandsPath, file)).href;
        try {
            const mod = await import(filePath);
            if (!mod.data) continue;
            const json = typeof mod.data.toJSON === "function" ? mod.data.toJSON() : mod.data;
            if (!json?.name || !json?.description) continue;

            // Top.gg only needs: name, description, type (1 = CHAT_INPUT slash command)
            commands.push({
                name: String(json.name),
                description: String(json.description).slice(0, 100),
                type: json.type ?? 1,
            });
        } catch (e) {
            // Some commands may have optional peer deps — skip silently
        }
    }

    if (commands.length === 0) {
        console.warn("[TopGG Sync] No commands loaded — nothing to sync.");
        return;
    }

    // Sort alphabetically for clean display on top.gg
    commands.sort((a, b) => a.name.localeCompare(b.name));

    const url = `${TOPGG_API}/bots/${botId}/commands`;
    console.log(`[TopGG Sync] POSTing ${commands.length} commands to ${url} ...`);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(commands),
        });

        if (res.ok) {
            console.log(`[TopGG Sync] ✅ Synced ${commands.length} commands to Top.gg successfully`);
            return;
        }

        // Try to get the response body for a useful error message
        const contentType = res.headers.get("content-type") ?? "";
        let bodyText;
        try {
            bodyText = await res.text();
        } catch {
            bodyText = "(could not read body)";
        }

        if (contentType.includes("text/html")) {
            // top.gg returns its HTML 404 page when the endpoint/token is wrong
            if (res.status === 401 || res.status === 403) {
                console.warn(`[TopGG Sync] Auth failed (${res.status}) — check your TOPGG_TOKEN. Get it from: top.gg → Your Bot → Edit → Token`);
            } else if (res.status === 404) {
                console.warn(`[TopGG Sync] 404 Not Found — the bot ID (${botId}) may not be listed on Top.gg yet, or your TOPGG_TOKEN is for a different bot. URL: ${url}`);
            } else {
                console.warn(`[TopGG Sync] Failed — HTTP ${res.status} (HTML response). URL: ${url}`);
            }
        } else {
            console.warn(`[TopGG Sync] Failed — HTTP ${res.status}: ${bodyText.slice(0, 300)}`);
        }
    } catch (err) {
        console.warn("[TopGG Sync] Network error:", err.message);
    }
}
