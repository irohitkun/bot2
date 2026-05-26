import { clearSnipe } from "../utils/snipeCache.js";
export const command = {
    name: "cs",
    aliases: ["clearsnipe"],
    usage: "%cs  |  %clearsnipe",
    description: "Clear the sniped message cache for this channel",
    async execute(message) {
        const cleared = clearSnipe(message.channelId);
        try {
            await message.react(cleared ? "✅" : "❌");
        } catch { }
    },
};
