import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { INVITE_URL, DOCS_URL, TOPGG_URL, FEEDBACK_URL } from "../config/constants.js";

export const data = new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the invite link to add CruxBot to your server");

export async function execute(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("➕ Add CruxBot to Your Server")
        .setDescription(
            `**[➕ Invite CruxBot](${INVITE_URL})**\n` +
            `Add the bot to any server you manage.\n\n` +
            `**[📖 Documentation](${DOCS_URL})**\n` +
            `Full command reference, setup guides, and feature breakdowns.\n\n` +
            `**[🗳️ Vote on Top.gg](${TOPGG_URL})**\n` +
            `Voting helps others discover CruxBot and earns you rewards.\n\n` +
            `**[💬 Feedback & Suggestions](${FEEDBACK_URL})**\n` +
            `Report bugs or suggest new features.`
        )
        .setFooter({ text: "Thanks for using CruxBot! · cruxbot.vercel.app" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Invite Bot").setEmoji("➕").setStyle(ButtonStyle.Link).setURL(INVITE_URL),
        new ButtonBuilder().setLabel("Docs").setEmoji("📖").setStyle(ButtonStyle.Link).setURL(DOCS_URL),
        new ButtonBuilder().setLabel("Vote").setEmoji("🗳️").setStyle(ButtonStyle.Link).setURL(TOPGG_URL),
        new ButtonBuilder().setLabel("Feedback").setEmoji("💬").setStyle(ButtonStyle.Link).setURL(FEEDBACK_URL),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
}
