import { Events, EmbedBuilder } from "discord.js";
import { setSnipe } from "../utils/snipeCache.js";
import { sendModLog } from "../utils/modLog.js";

export const name = Events.MessageDelete;
export const once = false;

export async function execute(message) {
    try {
        if (message.partial) return;
        if (message.author?.bot) return;
        if (!message.content) return;

        setSnipe(message.channelId, message);

        if (!message.guild) return;

        const content = message.content.length > 1024
            ? message.content.slice(0, 1021) + "..."
            : message.content;

        await sendModLog(message.guild, new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🗑️ Message Deleted")
            .addFields(
                { name: "Author", value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: "Channel", value: message.channel.toString(), inline: true },
                { name: "Content", value: content },
            )
            .setTimestamp(),
            "Event Log"
        );
    } catch (err) {
        console.warn("[MessageDelete] Error:", err.message);
    }
}
