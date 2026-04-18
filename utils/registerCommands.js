import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
export async function registerSlashCommands(token, clientId) {
    const commandsPath = resolve(__dirname, "../commands");
    const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    const commandData = [];
    for (const file of commandFiles) {
        const filePath = pathToFileURL(resolve(commandsPath, file)).href;
        const command = await import(filePath);
        if (command.data) {
            commandData.push(command.data.toJSON());
        }
    }
    const rest = new REST({ version: "10" }).setToken(token);
    console.log(`Registering ${commandData.length} slash commands globally...`);
    await rest.put(Routes.applicationCommands(clientId), { body: commandData });
    console.log("Slash commands registered successfully.");
}
