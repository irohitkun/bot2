import { EmbedBuilder } from "discord.js";
import { animateMessage } from "../utils/community.js";
const RESPONSES = [
    "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes, definitely.", "You may rely on it.",
    "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.", "Signs point to yes.",
    "Reply hazy, try again.", "Ask again later.", "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
    "Don't count on it.", "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful.",
];
export const command = {
    name: "8ball",
    usage: "%8ball <question>",
    description: "Ask the magic 8-ball",
    async execute(message, args) {
        if (!args.length)
            return void message.reply(`Usage: \`${this.usage}\``);
        const question = args.join(" ");
        const answer = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎱 Magic 8-Ball")
            .addFields(
                { name: "❓ Question", value: question },
                { name: "🎱 Answer", value: `**${answer}**` },
            )
            .setFooter({ text: `Asked by ${message.author.tag}` })
            .setTimestamp();
        await animateMessage(message, [
            "🎱 The 8-ball sinks into the mist...",
            "✨ A message starts forming inside...",
            "🔮 Revealing your answer...",
        ], { content: "", embeds: [embed] });
    },
};
