import "dotenv/config";
import { registerSlashCommands } from "./utils/registerCommands.js";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) {
    console.error("DISCORD_BOT_TOKEN is required to register slash commands.");
    process.exit(1);
}

if (!clientId) {
    console.error("DISCORD_CLIENT_ID is required to register slash commands.");
    process.exit(1);
}

await registerSlashCommands(token, clientId);