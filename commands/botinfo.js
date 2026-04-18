import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Show information about this bot");
export async function execute(interaction) {
    const { client } = interaction;
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const embed = new EmbedBuilder().setColor(0x5865f2)
        .setTitle(`🤖 ${client.user.tag}`)
        .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
        .addFields({ name: "Servers", value: `${client.guilds.cache.size}`, inline: true }, { name: "Users", value: `${client.users.cache.size}`, inline: true }, { name: "Ping", value: `${client.ws.ping}ms`, inline: true }, { name: "Uptime", value: uptimeStr, inline: true }, { name: "Memory", value: `${memMB} MB`, inline: true }, { name: "Node.js", value: process.version, inline: true })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
