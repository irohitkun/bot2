import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { DOCS_URL, FEEDBACK_URL, INVITE_URL, TOPGG_URL } from "../config/constants.js";
import { LATEST } from "../data/changelog.js";

export const data = new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Show information about CruxBot");

export async function execute(interaction) {
    const { client } = interaction;
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🤖 ${client.user.username}`)
        .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: "Servers",  value: `${client.guilds.cache.size}`,  inline: true },
            { name: "Users",    value: `${client.users.cache.size}`,   inline: true },
            { name: "Ping",     value: `${client.ws.ping}ms`,          inline: true },
            { name: "Uptime",   value: uptimeStr,                      inline: true },
            { name: "Memory",   value: `${memMB} MB`,                  inline: true },
            { name: "Node.js",  value: process.version,                inline: true },
            { name: "Version",  value: `v${LATEST.version} — ${LATEST.title}`, inline: false },
            { name: "Links",    value: `[📖 Docs](${DOCS_URL}) · [💬 Feedback](${FEEDBACK_URL}) · [➕ Invite](${INVITE_URL}) · [🗳️ Vote](${TOPGG_URL})`, inline: false },
        )
        .setFooter({ text: `cruxbot.vercel.app · /changelog latest to see what's new` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Docs").setEmoji("📖").setStyle(ButtonStyle.Link).setURL(DOCS_URL),
        new ButtonBuilder().setLabel("Feedback").setEmoji("💬").setStyle(ButtonStyle.Link).setURL(FEEDBACK_URL),
        new ButtonBuilder().setLabel("Invite").setEmoji("➕").setStyle(ButtonStyle.Link).setURL(INVITE_URL),
        new ButtonBuilder().setLabel("Vote").setEmoji("🗳️").setStyle(ButtonStyle.Link).setURL(TOPGG_URL),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
}
