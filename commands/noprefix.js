import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { setNoPrefixMode } from "../utils/prefixCache.js";
import { isPremiumGuild } from "../utils/permissions.js";
export const data = new SlashCommandBuilder()
    .setName("noprefix")
    .setDescription("Toggle no-prefix mode — bot responds without a prefix (Premium only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((opt) => opt.setName("enabled").setDescription("Enable or disable no-prefix mode").setRequired(true));
export async function execute(interaction) {
    const guildId = interaction.guild.id;
    const premium = await isPremiumGuild(guildId);
    if (!premium) {
        return interaction.reply({
            content: "❌ **No-Prefix Mode is a Premium feature.**\nContact us to activate premium for your server.",
            flags: 64,
        });
    }
    const enabled = interaction.options.getBoolean("enabled", true);
    await setNoPrefixMode(guildId, enabled);
    const embed = new EmbedBuilder()
        .setColor(enabled ? 0x57f287 : 0xed4245)
        .setTitle(`${enabled ? "✅" : "❌"} No-Prefix Mode ${enabled ? "Enabled" : "Disabled"}`)
        .setDescription(enabled
        ? "The bot will now respond to commands **without requiring a prefix**."
        : "The bot is back to **requiring a prefix**.")
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
