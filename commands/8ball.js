import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
const RESPONSES = [
    { text: "It is certain.", color: 0x57f287 },
    { text: "It is decidedly so.", color: 0x57f287 },
    { text: "Without a doubt.", color: 0x57f287 },
    { text: "Yes, definitely.", color: 0x57f287 },
    { text: "You may rely on it.", color: 0x57f287 },
    { text: "As I see it, yes.", color: 0x57f287 },
    { text: "Most likely.", color: 0x57f287 },
    { text: "Outlook good.", color: 0x57f287 },
    { text: "Yes.", color: 0x57f287 },
    { text: "Signs point to yes.", color: 0x57f287 },
    { text: "Reply hazy, try again.", color: 0xfee75c },
    { text: "Ask again later.", color: 0xfee75c },
    { text: "Better not tell you now.", color: 0xfee75c },
    { text: "Cannot predict now.", color: 0xfee75c },
    { text: "Concentrate and ask again.", color: 0xfee75c },
    { text: "Don't count on it.", color: 0xed4245 },
    { text: "My reply is no.", color: 0xed4245 },
    { text: "My sources say no.", color: 0xed4245 },
    { text: "Outlook not so good.", color: 0xed4245 },
    { text: "Very doubtful.", color: 0xed4245 },
];
export const data = new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a yes/no question")
    .addStringOption((opt) => opt.setName("question").setDescription("Your question").setRequired(true).setMaxLength(200));
export async function execute(interaction) {
    const question = interaction.options.getString("question", true);
    const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
    const style = await getGuildStyle(interaction.guild.id);
    const embed = new EmbedBuilder()
        .setColor(response.color)
        .setTitle("🎱 Magic 8-Ball")
        .addFields({ name: "❓ Question", value: question }, { name: "🎱 Answer", value: `**${response.text}**` })
        .setFooter({ text: `Asked by ${interaction.user.tag}${style.footer ? ` • ${style.footer}` : ""}` })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
