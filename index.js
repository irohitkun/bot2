import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { get as httpGet } from "http";
import express from "express";
import { loadCommands } from "./utils/loadCommands.js";
import { loadEvents } from "./utils/loadEvents.js";
import { runMigrations } from "./db/migrate.js";
import { registerTopggWebhook } from "./utils/topggWebhook.js";

// ── Global crash protection ───────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
    console.error("[Process] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
    console.error("[Process] Uncaught exception:", err);
});

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

export const commands = new Collection();

function startHttpServer() {
    const port = parseInt(process.env.PORT ?? "3000", 10);

    const app = express();
    app.use(express.json());

    // ── Health check & keep-alive ─────────────────────────────────────────────
    app.get(["/", "/ping"], (req, res) => {
        res.json({ status: "ok", bot: client.user?.tag ?? "starting", uptime: process.uptime() });
    });

    // ── Top.gg vote webhook ───────────────────────────────────────────────────
    registerTopggWebhook(app, client);

    const server = app.listen(port, "0.0.0.0", () => {
        console.log(`HTTP server running on port ${port}`);
    });

    server.on("error", (err) => {
        console.warn("[HTTP] Server error:", err.message);
    });

    // Self-ping every 4 minutes to prevent host from sleeping the process
    setInterval(() => {
        const req = httpGet(`http://127.0.0.1:${port}/ping`, (res) => {
            console.log(`[Keep-alive] Self-ping OK — status ${res.statusCode}`);
        });
        req.on("error", (err) => console.warn("[Keep-alive] Self-ping failed:", err.message));
        req.setTimeout(10000, () => {
            req.destroy();
            console.warn("[Keep-alive] Self-ping timed out");
        });
    }, 4 * 60 * 1000);
}

// ── Discord client error handling ─────────────────────────────────────────────
client.on("error", (err) => {
    console.error("[Discord] Client error:", err.message);
});

client.on("warn", (info) => {
    console.warn("[Discord] Warning:", info);
});

client.on("shardDisconnect", (event, id) => {
    console.warn(`[Discord] Shard ${id} disconnected — code ${event.code}. Will auto-reconnect.`);
});

client.on("shardReconnecting", (id) => {
    console.log(`[Discord] Shard ${id} reconnecting...`);
});

client.on("shardResume", (id, replayed) => {
    console.log(`[Discord] Shard ${id} resumed — replayed ${replayed} events.`);
});

async function main() {
    startHttpServer();
    if (!process.env.DISCORD_BOT_TOKEN) {
        console.warn("DISCORD_BOT_TOKEN is not set. Add it to your environment, then restart the bot.");
        return;
    }
    await runMigrations();
    await loadCommands(commands);
    await loadEvents(client);
    await client.login(process.env.DISCORD_BOT_TOKEN);
}

main().catch((err) => {
    console.error("Fatal error starting bot:", err);
    process.exit(1);
});
