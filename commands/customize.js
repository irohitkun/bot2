import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { isPremiumGuild } from "../utils/permissions.js";
import { getGuildStyle, invalidateStyleCache, hexToInt } from "../utils/guildStyle.js";
export const data = new SlashCommandBuilder()
    .setName("customize")
    .setDescription("Customize how the bot looks in your server (Premium only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("color").setDescription("Change the bot embed color (hex code)")
    .addStringOption((opt) => opt.setName("hex").setDescription("Hex color e.g. #ff5733 or ff5733").setRequired(true)))
    .addSubcommand((sub) => sub.setName("footer").setDescription("Set a custom footer on bot messages")
    .addStringOption((opt) => opt.setName("text").setDescription("Footer text, or 'none' to remove").setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) => sub.setName("nickname").setDescription("Set the bot's nickname in this server")
    .addStringOption((opt) => opt.setName("name").setDescription("Nickname, or 'reset' to remove").setRequired(true).setMaxLength(32)))
    .addSubcommand((sub) => sub.setName("status").setDescription("View current customization settings"))
    .addSubcommand((sub) => sub.setName("reset").setDescription("Reset all customizations to default"));
export async function execute(interaction) {
    const guildId = interaction.guild.id;
    const premium = await isPremiumGuild(guildId);
    if (!premium) {
        return interaction.reply({ content: "❌ **Customize is a Premium feature.**\nContact us to activate premium for your server.", flags: 64 });
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "color") {
        const hex = interaction.options.getString("hex", true);
        const color = hexToInt(hex);
        if (color === null)
            return interaction.reply({ content: "❌ Invalid hex color. Use 6 hex characters e.g. `#ff5733`.", flags: 64 });
        const hexStr = hex.replace("#", "").toLowerCase();
        await db.insert(serverCustomizationTable).values({ guildId, embedColor: hexStr })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { embedColor: hexStr, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        const embed = new EmbedBuilder().setColor(color).setTitle("✅ Embed Color Updated").setDescription(`All bot embeds will now use **#${hexStr.toUpperCase()}**.`).setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }
    if (sub === "footer") {
        const text = interaction.options.getString("text", true);
        const footerText = text.toLowerCase() === "none" ? null : text;
        await db.insert(serverCustomizationTable).values({ guildId, footerText: footerText ?? undefined })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { footerText, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({ content: footerText ? `✅ Footer set to: **${footerText}**` : "✅ Footer removed.", flags: 64 });
    }
    if (sub === "nickname") {
        const name = interaction.options.getString("name", true);
        const botMember = interaction.guild.members.me;
        const newNick = name.toLowerCase() === "reset" ? null : name;
        await botMember.setNickname(newNick, `Changed by ${interaction.user.tag}`);
        return interaction.reply({ content: newNick ? `✅ Nickname set to **${newNick}**.` : "✅ Nickname reset.", flags: 64 });
    }
    if (sub === "status") {
        const style = await getGuildStyle(guildId);
        const embed = new EmbedBuilder().setColor(style.color).setTitle("🎨 Customization Settings")
            .addFields({ name: "Embed Color", value: `#${style.color.toString(16).padStart(6, "0").toUpperCase()}`, inline: true }, { name: "Footer Text", value: style.footer ?? "Default", inline: true }).setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }
    if (sub === "reset") {
        await db.insert(serverCustomizationTable).values({ guildId, embedColor: "5865f2", footerText: null })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { embedColor: "5865f2", footerText: null, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        const botMember = interaction.guild.members.me;
        await botMember.setNickname(null).catch(() => { });
        return interaction.reply({ content: "✅ All customizations have been reset to default.", flags: 64 });
    }
}
