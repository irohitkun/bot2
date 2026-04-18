import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
export const command = {
    name: "unlock",
    usage: "%unlock",
    description: "Unlock the current channel",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return void message.reply("❌ You don't have permission to manage channels.");
        }
        const channel = message.channel;
        const guild = message.guild;
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("🔓 Channel Unlocked")
            .addFields({ name: "Channel", value: channel.toString(), inline: true }, { name: "Moderator", value: message.author.tag, inline: true })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
