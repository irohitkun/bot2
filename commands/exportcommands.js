/**
 * /exportcommands — Admin only
 * Fetches the bot's registered slash commands from Discord's API and attaches
 * them as a JSON file that can be pasted directly into the top.gg dashboard
 * "Import from Discord" dialog (Commands tab → Import button).
 */
import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, REST, Routes } from "discord.js";
import { BOT_OWNERS } from "../config/constants.js";

export const data = new SlashCommandBuilder()
    .setName("exportcommands")
    .setDescription("Export slash command JSON for top.gg import (bot owner only)");

export async function execute(interaction) {
    // Restrict to bot owners only
    const ownerId = "1298631508533313536";
    const extraOwners = (process.env.BOT_OWNERS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const allOwners = new Set([ownerId, ...extraOwners]);

    if (!allOwners.has(interaction.user.id)) {
        return interaction.reply({ content: "❌ This command is restricted to bot owners.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const token = process.env.DISCORD_BOT_TOKEN;
        const clientId = interaction.client.user.id;
        const rest = new REST({ version: "10" }).setToken(token);

        // Fetch the globally registered slash commands from Discord's API
        const commands = await rest.get(Routes.applicationCommands(clientId));

        if (!Array.isArray(commands) || commands.length === 0) {
            return interaction.editReply("⚠️ No registered slash commands found. Make sure the bot has run at least once so commands are registered.");
        }

        // Top.gg "Import from Discord" expects the exact Discord API payload
        const json = JSON.stringify(commands, null, 2);
        const buffer = Buffer.from(json, "utf-8");
        const attachment = new AttachmentBuilder(buffer, { name: "commands.json" });

        await interaction.editReply({
            content: [
                `✅ **${commands.length} commands exported.**`,
                ``,
                `**How to add them to Top.gg:**`,
                `1. Go to **top.gg → Your Bot → Edit → Commands**`,
                `2. Click the **Import** button`,
                `3. Open the attached \`commands.json\` file, copy all the text inside it`,
                `4. Paste it into the text box and click **Import**`,
            ].join("\n"),
            files: [attachment],
        });
    } catch (err) {
        console.error("[ExportCommands] Error:", err);
        await interaction.editReply(`❌ Failed to fetch commands: ${err.message}`);
    }
}
