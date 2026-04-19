import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { createServer, get as httpGet } from "http";
import { loadCommands } from "./utils/loadCommands.js";
import { loadEvents } from "./utils/loadEvents.js";

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        ...(process.env.MESSAGE_CONTENT_INTENT_ENABLED === "true" ? [GatewayIntentBits.MessageContent] : []),
    ],
    // Partials are required to receive reactions on messages sent before the bot started
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

export const commands = new Collection();

function startKeepAliveServer() {
    const port = parseInt(process.env.PORT ?? "3000", 10);
    const server = createServer((req, res) => {
        if (req.url === "/ping" || req.url === "/") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", bot: client.user?.tag ?? "starting", uptime: process.uptime() }));
        } else {
            res.writeHead(404);
            res.end("Not found");
        }
    });

    server.listen(port, () => {
        console.log(`Keep-alive server running on port ${port}`);
    });

    setInterval(() => {
        const req = httpGet(`http://localhost:${port}/ping`, (res) => {
            console.log(`[Keep-alive] Self-ping OK — status ${res.statusCode}`);
        });
        req.on("error", (err) => console.warn("[Keep-alive] Self-ping failed:", err.message));
    }, 5 * 60 * 1000);
}

async function main() {
    startKeepAliveServer();
    if (!process.env.DISCORD_BOT_TOKEN) {
        console.warn("DISCORD_BOT_TOKEN is not set. Add it to your environment, then restart the bot.");
        return;
    }
    await loadCommands(commands);
    await loadEvents(client);
    await client.login(process.env.DISCORD_BOT_TOKEN);
}

main().catch((err) => {
    console.error("Fatal error starting bot:", err);
    process.exit(1);
});
