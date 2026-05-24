import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Delete all messages in a channel and recreate it — settings and locks are preserved")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
        o.setName("channel").setDescription("Channel to nuke (defaults to current)").setRequired(false));

export async function execute(interaction) {
    const target = interaction.options.getChannel("channel") ?? interaction.channel;

    const confirmEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription(`Nuke <#${target.id}>? All messages will be permanently deleted.\nChannel settings and permission locks are preserved.`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("nuke_confirm").setLabel("Nuke it").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("nuke_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: 64 });

    const btn = await interaction.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith("nuke_"),
        time: 15_000,
    }).catch(() => null);

    if (!btn || btn.customId === "nuke_cancel") {
        await interaction.editReply({ content: "❌ Nuke cancelled.", embeds: [], components: [] });
        return;
    }

    await btn.update({ content: "💣 Nuking...", embeds: [], components: [] });

    try {
        const ch = target;
        const overwrites = [...ch.permissionOverwrites.cache.values()].map((o) => ({
            id: o.id,
            allow: o.allow,
            deny: o.deny,
            type: o.type,
        }));

        const newChannel = await ch.clone({
            name: ch.name,
            topic: ch.topic ?? undefined,
            nsfw: ch.nsfw,
            rateLimitPerUser: ch.rateLimitPerUser,
            parent: ch.parent ?? undefined,
            permissionOverwrites: overwrites,
            position: ch.rawPosition,
            reason: `Nuke by ${interaction.user.tag}`,
        });

        await ch.delete(`Nuke by ${interaction.user.tag}`).catch(() => {});
        await newChannel.send("first");
    } catch (err) {
        await interaction.editReply({
            content: `❌ Nuke failed: ${err?.message ?? "Unknown error"}`,
            embeds: [],
            components: [],
        }).catch(() => {});
    }
}
