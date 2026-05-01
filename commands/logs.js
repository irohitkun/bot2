import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { invalidateStyleCache, getLogChannel } from "../utils/guildStyle.js";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";
import { sendModLog } from "../utils/modLog.js";

export const data = new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configure the moderation log channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("set").setDescription("Set the log channel")
        .addChannelOption((opt) => opt.setName("channel").setDescription("The channel for logs").setRequired(true)))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable moderation logs"))
    .addSubcommand((sub) => sub.setName("test").setDescription("Send a test message to verify the log channel is working"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const guild = interaction.guild;

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
            .values({ guildId, logChannelId: null })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { logChannelId: null, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({ content: "✅ Moderation logs disabled.", flags: 64 });
    }

    if (sub === "test") {
        const logChannelId = await getLogChannel(guildId);
        if (!logChannelId) {
            return interaction.reply({ content: "❌ No log channel is configured. Run `/logs set` first.", flags: 64 });
        }

        const channel = guild.channels.cache.get(logChannelId)
            ?? await guild.channels.fetch(logChannelId).catch(() => null);

        if (!channel) {
            return interaction.reply({ content: `❌ Log channel <#${logChannelId}> no longer exists. Run \`/logs set\` to update it.`, flags: 64 });
        }

        if (!channel.isTextBased()) {
            return interaction.reply({ content: `❌ <#${logChannelId}> is not a text channel. Run \`/logs set\` to choose a valid channel.`, flags: 64 });
        }

        const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
        if (me) {
            const perms = channel.permissionsFor(me);
            const missing = [];
            if (!perms?.has(PermissionsBitField.Flags.SendMessages)) missing.push("SendMessages");
            if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) missing.push("EmbedLinks");
            if (missing.length) {
                return interaction.reply({
                    content: `❌ I'm missing **${missing.join("** and **")}** in <#${logChannelId}>. Fix the channel permissions and try again.`,
                    flags: 64,
                });
            }
        }

        await sendModLog(guild, new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Log Channel Test")
            .setDescription("Your log channel is configured correctly! Mod actions and server events will appear here.")
            .addFields({ name: "Tested By", value: `${interaction.user.tag} (${interaction.user.id})` })
            .setTimestamp()
        );

        return interaction.reply({ content: `✅ Test message sent to <#${logChannelId}>.`, flags: 64 });
    }
}
