import { Events, ActivityType } from "discord.js";
import { registerSlashCommands } from "../utils/registerCommands.js";
export const name = Events.ClientReady;
export const once = true;
export async function execute(client) {
    console.log(`Logged in as ${client.user?.tag}`);
    client.user?.setActivity("your server 🛡️", { type: ActivityType.Watching });
    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = client.user.id;
    try {
        await registerSlashCommands(token, clientId);
    }
    catch (err) {
        console.error("Failed to register slash commands:", err);
    }
}
