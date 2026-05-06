import {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
} from "discord.js";
import { db, confessionSettingsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("confession")
    .setDescription("Anonymous confession system")
    .addSubcommand((sub) => sub.setName("setup").setDescription("Configure the confession system (admin)")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel where approved confessions are posted").setRequired(true))
        .addChannelOption((o) => o.setName("review_channel").setDescription("Optional: send confessions here for mod review before posting").setRequired(false)))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable the confession system (admin)"))
    .addSubcommand((sub) => sub.setName("submit").setDescription("Submit an anonymous confession"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: "❌ You need Administrator permission to configure confessions.", flags: 64 });
        }
        const channel = interaction.options.getChannel("channel");
        const reviewChannel = interaction.options.getChannel("review_channel");
        await db.insert(confessionSettingsTable).values({
            guildId: interaction.guild.id,
            enabled: true,
            channelId: channel.id,
            reviewChannelId: reviewChannel?.id ?? null,
            updatedAt: new Date(),
        }).onConflictDoUpdate({ target: confessionSettingsTable.guildId, set: {
            enabled: true, channelId: channel.id,
            reviewChannelId: reviewChannel?.id ?? null, updatedAt: new Date(),
        }});
        const { color } = await getGuildStyle(interaction.guild.id);
        const embed = new EmbedBuilder().setColor(color).setTitle("💭 Confession System Enabled")
            .addFields(
                { name: "Confession Channel", value: `<#${channel.id}>`, inline: true },
                { name: "Review Channel", value: reviewChannel ? `<#${reviewChannel.id}>` : "None (auto-post)", inline: true },
                { name: "How to Submit", value: "Members use `/confession submit` to anonymously submit a confession.", inline: false },
            ).setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    if (sub === "disable") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: "❌ You need Administrator permission.", flags: 64 });
        }
        await db.update(confessionSettingsTable).set({ enabled: false, updatedAt: new Date() })
            .where(eq(confessionSettingsTable.guildId, interaction.guild.id));
        return interaction.reply({ content: "✅ Confession system disabled.", flags: 64 });
    }

    if (sub === "submit") {
        const [settings] = await db.select().from(confessionSettingsTable).where(eq(confessionSettingsTable.guildId, interaction.guild.id));
        if (!settings?.enabled || !settings.channelId) {
            return interaction.reply({ content: "❌ The confession system is not enabled in this server.", flags: 64 });
        }
        const modal = new ModalBuilder()
            .setCustomId(`confession:submit:${interaction.guild.id}`)
            .setTitle("💭 Anonymous Confession")
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("confession_text")
                        .setLabel("Your confession (anonymous)")
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder("Write your confession here... It will be posted anonymously.")
                        .setMinLength(10)
                        .setMaxLength(1800)
                        .setRequired(true),
                ),
            );
        return interaction.showModal(modal);
    }
}
