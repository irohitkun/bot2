import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
export async function loadCommands(commands) {
    const commandsPath = resolve(__dirname, "../commands");
    const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    for (const file of commandFiles) {
        const filePath = pathToFileURL(resolve(commandsPath, file)).href;
        const command = await import(filePath);
        if (command.data && command.execute) {
            commands.set(command.data.name, command);
            console.log(`Loaded command: ${command.data.name}`);
        }
        else {
            console.warn(`Skipping ${file}: missing data or execute`);
        }
    }
}
