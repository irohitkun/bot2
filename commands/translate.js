import { SlashCommandBuilder, EmbedBuilder, } from "discord.js";
import { createAIChatCompletion, getAIStatus } from "../utils/aiProvider.js";
const LANGUAGES = {
    english: "English",
    spanish: "Spanish",
    french: "French",
    german: "German",
    italian: "Italian",
    portuguese: "Portuguese",
    russian: "Russian",
    japanese: "Japanese",
    korean: "Korean",
    chinese: "Chinese (Simplified)",
    arabic: "Arabic",
    hindi: "Hindi",
    turkish: "Turkish",
    dutch: "Dutch",
    polish: "Polish",
    swedish: "Swedish",
    norwegian: "Norwegian",
    danish: "Danish",
    greek: "Greek",
    hebrew: "Hebrew",
    indonesian: "Indonesian",
    vietnamese: "Vietnamese",
    thai: "Thai",
    ukrainian: "Ukrainian",
};
export const data = new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text — defaults to English if no language is chosen")
    .addStringOption((opt) => opt.setName("text").setDescription("The text to translate").setRequired(true))
    .addStringOption((opt) => opt
    .setName("to")
    .setDescription("Target language (default: English)")
    .setRequired(false)
    .addChoices(...Object.entries(LANGUAGES).map(([value, name]) => ({ name, value }))))
    .addStringOption((opt) => opt
    .setName("from")
    .setDescription("Source language (leave blank to auto-detect)")
    .setRequired(false)
    .addChoices(...Object.entries(LANGUAGES).map(([value, name]) => ({ name, value }))));
export async function execute(interaction) {
    const text = interaction.options.getString("text", true);
    const toKey = interaction.options.getString("to") ?? "english";
    const fromKey = interaction.options.getString("from");
    const toLang = LANGUAGES[toKey] ?? "English";
    const fromLang = fromKey ? LANGUAGES[fromKey] : null;
    await interaction.deferReply();
    const aiStatus = getAIStatus();
    if (!aiStatus.ready) {
        return interaction.editReply(`Translation is not configured: ${aiStatus.message}`);
    }
    const systemPrompt = fromLang
        ? `You are a professional translator. Translate the following text from ${fromLang} to ${toLang}. Return only the translated text, nothing else.`
        : `You are a professional translator. Detect the language of the following text and translate it to ${toLang}. Return only the translated text, nothing else.`;
    const response = await createAIChatCompletion({
        maxTokens: 1024,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
        ],
    });
    const translated = response.choices[0]?.message?.content?.trim();
    if (!translated) {
        return interaction.editReply("❌ Could not translate the text. Please try again.");
    }
    const detectedInfo = fromLang ? `From: ${fromLang}` : "From: Auto-detected";
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🌐 Translation")
        .addFields({ name: "Original", value: text.length > 1024 ? text.slice(0, 1021) + "..." : text }, { name: `Translated to ${toLang}`, value: translated.length > 1024 ? translated.slice(0, 1021) + "..." : translated })
        .setFooter({ text: `${detectedInfo} → ${toLang} • ${aiStatus.provider}/${aiStatus.model} • Requested by ${interaction.user.tag}` })
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
