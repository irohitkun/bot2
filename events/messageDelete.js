import { Events } from "discord.js";
import { setSnipe } from "../utils/snipeCache.js";
export const name = Events.MessageDelete;
export const once = false;
export async function execute(message) {
    if (message.partial)
        return;
    if (message.author?.bot)
        return;
    if (!message.content)
        return;
    setSnipe(message.channelId, message);
}
