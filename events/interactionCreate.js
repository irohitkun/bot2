import { Events } from "discord.js";
import { commands } from "../index.js";
export const name = Events.InteractionCreate;
export const once = false;
export async function execute(interaction) {
    if (!interaction.isChatInputCommand())
        return;
    if (!interaction.guild) {
        await interaction.reply({ content: "❌ This command can only be used inside a server.", flags: 64 }).catch(() => { });
        return;
    }
    const command = commands.get(interaction.commandName);
    if (!command) {
        console.warn(`Unknown command: ${interaction.commandName}`);
        return;
    }
    try {
        await command.execute(interaction);
    }
    catch (err) {
        console.error(`Error executing /${interaction.commandName}:`, err);
        const msg = { content: "❌ An error occurred while running this command.", flags: 64 };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(msg).catch(() => { });
        }
        else {
            await interaction.reply(msg).catch(() => { });
        }
    }
}
