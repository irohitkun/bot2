import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
export const data = new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll")
    .addStringOption((opt) => opt.setName("question").setDescription("The poll question").setRequired(true).setMaxLength(256))
    .addStringOption((opt) => opt.setName("options").setDescription("Options separated by | (e.g. Yes|No|Maybe)").setRequired(true));
export async function execute(interaction) {
    const question = interaction.options.getString("question", true);
    const rawOptions = interaction.options.getString("options", true).split("|").map((o) => o.trim()).filter(Boolean);
    if (rawOptions.length < 2)
        return interaction.reply({ content: "❌ Provide at least 2 options separated by `|`.", flags: 64 });
    if (rawOptions.length > 10)
        return interaction.reply({ content: "❌ Maximum 10 options allowed.", flags: 64 });
    const optionLines = rawOptions.map((opt, i) => `${NUMBERS[i]} ${opt}`).join("\n");
    const embed = new EmbedBuilder().setColor(0x5865f2)
        .setTitle("📊 " + question)
        .setDescription(optionLines)
        .setFooter({ text: `Poll by ${interaction.user.tag}` })
        .setTimestamp();
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    for (let i = 0; i < rawOptions.length; i++) {
        await msg.react(NUMBERS[i]).catch(() => { });
    }
}
