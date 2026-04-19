import { EmbedBuilder } from "discord.js";
import { createAIChatCompletion, getAIStatus } from "../utils/aiProvider.js";
const LANGUAGE_MAP = {
    english: "English", en: "English",
    spanish: "Spanish", es: "Spanish",
    french: "French", fr: "French",
    german: "German", de: "German",
    italian: "Italian", it: "Italian",
    portuguese: "Portuguese", pt: "Portuguese",
    russian: "Russian", ru: "Russian",
    japanese: "Japanese", ja: "Japanese",
    korean: "Korean", ko: "Korean",
    chinese: "Chinese (Simplified)", zh: "Chinese (Simplified)",
    arabic: "Arabic", ar: "Arabic",
    hindi: "Hindi", hi: "Hindi",
    turkish: "Turkish", tr: "Turkish",
    dutch: "Dutch", nl: "Dutch",
    polish: "Polish", pl: "Polish",
    swedish: "Swedish", sv: "Swedish",
    greek: "Greek", el: "Greek",
    hebrew: "Hebrew", he: "Hebrew",
    ukrainian: "Ukrainian", uk: "Ukrainian",
};
export const command = {
    name: "translate",
    usage: "%translate [language] <text>  OR  reply to a message + %translate [language]",
    description: "Translate text to English by default, or specify a language.",
    async execute(message, args) {
        let toLang = "English";
        let text = "";
        if (args.length > 0) {
            const firstArgLower = args[0].toLowerCase();
            if (LANGUAGE_MAP[firstArgLower]) {
                toLang = LANGUAGE_MAP[firstArgLower];
                text = args.slice(1).join(" ");
            }
            else {
                text = args.join(" ");
            }
        }
        if (!text && message.reference?.messageId) {
            const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
            if (!replied || !replied.content) {
                return void message.reply("❌ Could not find text in the replied message to translate.");
            }
            text = replied.content;
        }
        if (!text) {
            return void message.reply(`Usage:\n\`%translate <text>\` — translate to English\n\`%translate <language> <text>\` — translate to a specific language\nOr reply to any message with \`%translate\` or \`%translate <language>\``);
        }
        await message.channel.sendTyping().catch(() => { });
        const aiStatus = getAIStatus();
        if (!aiStatus.ready) {
            return void message.reply(`Translation is not configured: ${aiStatus.message}`);
        }
        const response = await createAIChatCompletion({
            maxTokens: 1024,
            messages: [
                {
                    role: "system",
                    content: `You are a professional translator. Detect the language of the text and translate it to ${toLang}. Return only the translated text, nothing else.`,
                },
                { role: "user", content: text },
            ],
        });
        const translated = response.choices[0]?.message?.content?.trim();
        if (!translated)
            return void message.reply("❌ Translation failed. Please try again.");
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🌐 Translation")
            .addFields({ name: "Original", value: text.length > 1024 ? text.slice(0, 1021) + "..." : text }, { name: `Translated to ${toLang}`, value: translated.length > 1024 ? translated.slice(0, 1021) + "..." : translated })
            .setFooter({ text: `${aiStatus.provider}/${aiStatus.model} • Requested by ${message.author.tag}` })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
