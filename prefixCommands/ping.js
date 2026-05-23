import { EmbedBuilder } from "discord.js";
export const command = {
    name: "ping",
    aliases: ["latency", "pong"],
    usage: "%ping",
    description: "Check bot latency",
    async execute(message) {
        const sent = await message.reply("📡 Pinging...");
        const roundtrip = sent.createdTimestamp - message.createdTimestamp;
        const ws = message.client.ws.ping;
        const embed = new EmbedBuilder()
            .setColor(roundtrip < 100 ? 0x57f287 : roundtrip < 250 ? 0xfee75c : 0xed4245)
            .setTitle("🏓 Pong!")
            .addFields({ name: "Roundtrip", value: `\`${roundtrip}ms\``, inline: true }, { name: "WebSocket", value: `\`${ws}ms\``, inline: true }).setTimestamp();
        await sent.edit({ content: null, embeds: [embed] });
    },
};
