import { clearSnipe } from "../utils/snipeCache.js";
export const command = {
    name: "cs",
    aliases: ["clearsnipe"],
    usage: "%cs  |  %clearsnipe",
    description: "Clear the sniped message cache for this channel",
    async execute(message) {
        const cleared = clearSnipe(message.channelId);
        if (!cleared)
            return void message.reply("📭 There's nothing in the snipe cache to clear.");
        await message.reply("🗑️ Snipe cache cleared for this channel.");
    },
};
