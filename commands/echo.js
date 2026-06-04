import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Make the bot say something")
    .addStringOption((opt) =>
        opt.setName("message").setDescription("The message to send").setRequired(true).setMaxLength(2000))
    .addChannelOption((opt) =>
        opt.setName("channel").setDescription("Channel to send in (defaults to current)").setRequired(false))
    .addStringOption((opt) =>
        opt.setName("reply_to").setDescription("Message ID to reply to").setRequired(false))
    .addBooleanOption((opt) =>
        opt.setName("embed").setDescription("Wrap the message in an embed? (default: false)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
    const content = interaction.options.getString("message");
    const target = interaction.options.getChannel("channel") ?? interaction.channel;
    const replyToId = interaction.options.getString("reply_to");
    const asEmbed = interaction.options.getBoolean("embed") ?? false;

    if (!target?.isTextBased()) {
        return interaction.reply({ content: "❌ That channel is not a text channel.", flags: 64 });
    }

    const me = interaction.guild.members.me;
    if (!target.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({ content: `❌ I don't have permission to send messages in <#${target.id}>.`, flags: 64 });
    }

    let replyTarget = null;
    if (replyToId) {
        replyTarget = await target.messages.fetch(replyToId).catch(() => null);
        if (!replyTarget) {
            return interaction.reply({ content: "❌ Could not find that message ID in the target channel.", flags: 64 });
        }
    }

    try {
        let payload;
        if (asEmbed) {
            const { color } = await getGuildStyle(interaction.guild.id);
            payload = { embeds: [new EmbedBuilder().setColor(color).setDescription(content)] };
        } else {
            payload = { content };
        }

        if (replyTarget) {
            await replyTarget.reply(payload);
        } else {
            await target.send(payload);
        }
    } catch (err) {
        return interaction.reply({ content: `❌ Failed to send message: ${err.message}`, flags: 64 });
    }

    const confirmed = target.id === interaction.channelId
        ? "✅ Sent!"
        : `✅ Sent to <#${target.id}>!`;
    return interaction.reply({ content: confirmed, flags: 64 });
}
