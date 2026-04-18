import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
export const command = {
    name: "slowmode",
    usage: "%slowmode <seconds>",
    description: "Set slowmode for the channel (0 = off)",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return void message.reply("❌ You don't have permission to manage channels.");
        }
        if (!args[0])
            return void message.reply(`Usage: \`${this.usage}\``);
        const seconds = parseInt(args[0], 10);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return void message.reply("❌ Please provide a number between 0 and 21600.");
        }
        const channel = message.channel;
        await channel.setRateLimitPerUser(seconds, `Set by ${message.author.tag}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⏱️ Slowmode Updated")
            .addFields({ name: "Channel", value: channel.toString(), inline: true }, { name: "Slowmode", value: seconds === 0 ? "Disabled" : `${seconds} second(s)`, inline: true }, { name: "Set By", value: message.author.tag, inline: true })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
