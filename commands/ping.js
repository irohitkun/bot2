import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency and response time");
export async function execute(interaction) {
    const sent = await interaction.reply({ content: "📡 Pinging...", fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const ws = interaction.client.ws.ping;
    const embed = new EmbedBuilder()
        .setColor(roundtrip < 100 ? 0x57f287 : roundtrip < 250 ? 0xfee75c : 0xed4245)
        .setTitle("🏓 Pong!")
        .addFields({ name: "Roundtrip Latency", value: `\`${roundtrip}ms\``, inline: true }, { name: "WebSocket Latency", value: `\`${ws}ms\``, inline: true })
        .setFooter({ text: "Green < 100ms | Yellow < 250ms | Red ≥ 250ms" })
        .setTimestamp();
    await interaction.editReply({ content: null, embeds: [embed] });
}
