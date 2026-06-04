import { EmbedBuilder, PermissionFlagsBits } from "discord.js";

export const command = {
    name: "echo",
    usage: "%echo [#channel] <message>",
    description: "Make the bot say something",
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply({ content: "❌ You need **Manage Messages** permission to use this.", flags: 64 });
        }

        let target = message.channel;
        let text = args.join(" ");

        // Allow optional leading channel mention: %echo #general Hello!
        const channelMention = message.mentions.channels.first();
        if (channelMention && args[0]?.startsWith("<#")) {
            target = channelMention;
            text = args.slice(1).join(" ").trim();
        }

        if (!text) {
            return message.reply(`Usage: \`${this.usage}\``);
        }
        if (text.length > 2000) {
            return message.reply("❌ Message cannot exceed 2000 characters.");
        }
        if (!target?.isTextBased()) {
            return message.reply("❌ That channel is not a text channel.");
        }

        const me = message.guild.members.me;
        if (!target.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
            return message.reply(`❌ I don't have permission to send messages in <#${target.id}>.`);
        }

        try {
            await target.send({ content: text });
            if (target.id !== message.channelId) {
                await message.reply({ content: `✅ Sent to <#${target.id}>!` });
            }
            await message.delete().catch(() => {});
        } catch (err) {
            await message.reply(`❌ Failed to send: ${err.message}`);
        }
    },
};
