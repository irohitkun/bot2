import { Events, EmbedBuilder } from "discord.js";
import { sendModLog } from "../utils/modLog.js";

export const name = Events.MessageUpdate;
export const once = false;

export async function execute(oldMessage, newMessage) {
    try {
        if (newMessage.partial) {
            await newMessage.fetch().catch(() => null);
        }
        if (!newMessage.guild || newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;

        const before = (oldMessage.content || "*not cached*").slice(0, 512);
        const after = newMessage.content.slice(0, 512);

        await sendModLog(newMessage.guild, new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("✏️ Message Edited")
            .setURL(newMessage.url)
            .addFields(
                { name: "Author", value: `${newMessage.author?.tag ?? "Unknown"} (${newMessage.author?.id ?? "?"})`, inline: true },
                { name: "Channel", value: newMessage.channel.toString(), inline: true },
                { name: "Before", value: before },
                { name: "After", value: after },
            )
            .setTimestamp(),
            "Event Log"
        );
    } catch (err) {
        console.warn("[MessageUpdate] Error:", err.message);
    }
}
