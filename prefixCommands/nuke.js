import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";

export const command = {
    name: "nuke",
    aliases: ["nk"],
    usage: "%nuke — delete all messages and recreate this channel",
    description: "Nukes the current channel (delete all messages, preserve settings and locks)",
    async execute(message) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return void message.reply("❌ You need the **Manage Channels** permission.");
        }

        const ch = message.channel;

        const confirmEmbed = new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription(`Nuke <#${ch.id}>? All messages will be permanently deleted.\nChannel settings and permission locks are preserved.`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`nuke_confirm_${message.id}`).setLabel("Nuke it").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`nuke_cancel_${message.id}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
        );

        const prompt = await ch.send({ embeds: [confirmEmbed], components: [row] });

        const btn = await prompt.awaitMessageComponent({
            filter: (i) => i.user.id === message.author.id && i.customId.endsWith(`_${message.id}`),
            time: 15_000,
        }).catch(() => null);

        if (!btn || btn.customId.startsWith("nuke_cancel")) {
            await prompt.edit({ content: "❌ Nuke cancelled.", embeds: [], components: [] }).catch(() => {});
            return;
        }

        await btn.update({ content: "💣 Nuking...", embeds: [], components: [] }).catch(() => {});

        try {
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
                reason: `Nuke by ${message.author.tag}`,
            });

            await ch.delete(`Nuke by ${message.author.tag}`).catch(() => {});
            await newChannel.send("first");
        } catch (err) {
            await ch.send(`❌ Nuke failed: ${err?.message ?? "Unknown error"}`).catch(() => {});
        }
    },
};
