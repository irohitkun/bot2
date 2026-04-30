import { hasTier, premiumDeniedEmbed } from "../utils/permissions.js";
import { runAIAssistant } from "../utils/aiAssistant.js";

export const command = {
    name: "ai",
    usage: "%ai <prompt>",
    description: "[Premium] AI Assistant — describe an action and the bot performs it",
    async execute(message, args) {
        const prompt = args.join(" ").trim();
        if (!message.guild) return void message.reply("❌ This command only works inside a server.");

        if (!await hasTier(message.guild.id, "premium")) {
            return void message.reply({ embeds: [premiumDeniedEmbed("AI Assistant")] });
        }

        if (!prompt) {
            return void message.reply(`Usage: \`${this.usage}\` — e.g. \`%ai timeout @user 10m for spam, then purge their last 20 messages\``);
        }

        const thinking = await message.reply("🤖 Thinking…");
        try {
            const member = message.member ?? await message.guild.members.fetch(message.author.id);
            const result = await runAIAssistant({
                prompt,
                member,
                channel: message.channel,
                guild: message.guild,
            });
            await thinking.edit({ content: "", ...result.payload });
        } catch (err) {
            console.error("AI Assistant prefix command failed:", err);
            await thinking.edit({ content: `❌ AI Assistant error: ${err?.message ?? "unknown"}`, embeds: [] });
        }
    },
};
