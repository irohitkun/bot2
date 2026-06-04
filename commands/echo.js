import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Make the bot say something")
    .addStringOption((opt) =>
        opt.setName("message").setDescription("The message to send").setRequired(true).setMaxLength(2000))
    .addChannelOption((opt) =>
        opt.setName("channel").setDescription("Channel to send in (defaults to current)").setRequired(false))
    .addBooleanOption((opt) =>
        opt.setName("embed").setDescription("Wrap the message in an embed? (default: false)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
    const content = interaction.options.getString("message");
    const target = interaction.options.getChannel("channel") ?? interaction.channel;
    const asEmbed = interaction.options.getBoolean("embed") ?? false;

    if (!target?.isTextBased()) {
        return interaction.reply({ content: "❌ That channel is not a text channel.", flags: 64 });
    }

    const me = interaction.guild.members.me;
    if (!target.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({ content: `❌ I don't have permission to send messages in <#${target.id}>.`, flags: 64 });
    }

    try {
        if (asEmbed) {
            const { color } = await import("../utils/guildStyle.js").then((m) => m.getGuildStyle(interaction.guild.id));
            await target.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(content)] });
        } else {
            await target.send({ content });
        }
    } catch (err) {
        return interaction.reply({ content: `❌ Failed to send message: ${err.message}`, flags: 64 });
    }

    const confirmed = target.id === interaction.channelId
        ? "✅ Sent!"
        : `✅ Sent to <#${target.id}>!`;
    return interaction.reply({ content: confirmed, flags: 64 });
}
