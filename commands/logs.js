import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { invalidateStyleCache } from "../utils/guildStyle.js";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";
export const data = new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configure the moderation log channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("set").setDescription("Set the log channel")
    .addChannelOption((opt) => opt.setName("channel").setDescription("The channel for logs").setRequired(true)))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable moderation logs"));
export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    if (!(await isPremiumGuild(guildId))) {
        return interaction.reply({ embeds: [premiumDeniedEmbed("Moderation Logs")], flags: 64 });
    }
    if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        await db.insert(serverCustomizationTable)
            .values({ guildId, logChannelId: channel.id })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { logChannelId: channel.id, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({ content: `✅ Log channel set to <#${channel.id}>.`, flags: 64 });
    }
    if (sub === "disable") {
        await db.insert(serverCustomizationTable)
            .values({ guildId, logChannelId: undefined })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { logChannelId: null, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({ content: "✅ Moderation logs disabled.", flags: 64 });
    }
}
