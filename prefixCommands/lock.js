import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
export const command = {
    name: "lock",
    usage: "%lock [reason]",
    description: "Lock the current channel",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return void message.reply("❌ You don't have permission to manage channels.");
        }
        const reason = args.join(" ") || "Channel locked by moderator";
        const channel = message.channel;
        const guild = message.guild;
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔒 Channel Locked")
            .addFields({ name: "Channel", value: channel.toString(), inline: true }, { name: "Moderator", value: message.author.tag, inline: true }, { name: "Reason", value: reason })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
