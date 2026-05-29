/**
 * Top.gg Command Sync
 * -------------------
 * Top.gg does NOT have a public API endpoint for writing bot commands.
 * Commands must be added manually via the top.gg dashboard Import feature.
 *
 * Use the /exportcommands slash command (bot owner only) to generate the
 * correct JSON file, then paste it into:
 *   top.gg → Your Bot → Edit → Commands → Import
 *
 * This module is kept as a no-op stub so the ready event import still works.
 */

export async function syncTopggCommands(_botId) {
    // Top.gg has no public write API for commands.
    // Use /exportcommands to generate the JSON for the dashboard import.
}
