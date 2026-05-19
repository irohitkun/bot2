import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle, invalidateStyleCache, hexToInt } from "../utils/guildStyle.js";
import { client } from "../index.js";

export const data = new SlashCommandBuilder()
    .setName("customize")
    .setDescription("Customize how the bot looks and behaves in your server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
        sub.setName("color")
            .setDescription("Change the bot embed color (hex code)")
            .addStringOption((opt) =>
                opt.setName("hex").setDescription("Hex color e.g. #ff5733 or ff5733").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("footer")
            .setDescription("Set a custom footer text on bot messages")
            .addStringOption((opt) =>
                opt.setName("text").setDescription("Footer text, or 'none' to remove").setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) =>
        sub.setName("banner")
            .setDescription("Set a custom banner/thumbnail image shown in bot embeds (Premium)")
            .addStringOption((opt) =>
                opt.setName("url").setDescription("Image URL (https://...), or 'none' to remove").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("avatar")
            .setDescription("Set a custom profile picture for the bot in this server (Premium)")
            .addStringOption((opt) =>
                opt.setName("url").setDescription("Image URL (https://...) — PNG, JPG, GIF supported. Use 'reset' to revert to global avatar.").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("nickname")
            .setDescription("Set the bot's nickname in this server (Premium)")
            .addStringOption((opt) =>
                opt.setName("name").setDescription("Nickname, or 'reset' to remove").setRequired(true).setMaxLength(32)))
    .addSubcommand((sub) =>
        sub.setName("status")
            .setDescription("View all current customization and server settings"))
    .addSubcommand((sub) =>
        sub.setName("reset")
            .setDescription("Reset all customizations to default"));

export async function execute(interaction) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    // ── Premium-only subcommands ──────────────────────────────────────────────
    if (sub === "banner" || sub === "nickname" || sub === "avatar") {
        const { isPremiumGuild, premiumDeniedEmbed } = await import("../utils/permissions.js");
        const premium = await isPremiumGuild(guildId);
        if (!premium) {
            return interaction.reply({ embeds: [premiumDeniedEmbed("Server Customization (avatar/banner/nickname)")], flags: 64 });
        }
    }

    if (sub === "color") {
        const hex = interaction.options.getString("hex", true);
        const color = hexToInt(hex);
        if (color === null)
            return interaction.reply({ content: "❌ Invalid hex color. Use 6 hex characters e.g. `#ff5733`.", flags: 64 });
        const hexStr = hex.replace("#", "").toLowerCase();
        await db.insert(serverCustomizationTable).values({ guildId, embedColor: hexStr })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { embedColor: hexStr, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        const embed = new EmbedBuilder().setColor(color).setTitle("✅ Embed Color Updated")
            .setDescription(`All bot embeds will now use **#${hexStr.toUpperCase()}**.`).setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "footer") {
        const text = interaction.options.getString("text", true);
        const footerText = text.toLowerCase() === "none" ? null : text;
        await db.insert(serverCustomizationTable).values({ guildId, footerText: footerText ?? undefined })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { footerText, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({
            content: footerText ? `✅ Footer set to: **${footerText}**` : "✅ Footer removed.",
            flags: 64,
        });
    }

    if (sub === "avatar") {
        const url = interaction.options.getString("url", true);
        const isReset = url.toLowerCase() === "reset";

        if (!isReset && !/^https?:\/\/.+/i.test(url)) {
            return interaction.reply({ content: "❌ Please provide a valid image URL starting with `https://`, or use `reset` to revert.", flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        try {
            const botMember = interaction.guild.members.me;
            await botMember.setAvatar(isReset ? null : url);

            const newAvatarUrl = botMember.displayAvatarURL({ size: 256 });
            const embed = new EmbedBuilder()
                .setColor((await getGuildStyle(guildId)).color)
                .setTitle(isReset ? "✅ Avatar Reset" : "✅ Server Avatar Updated")
                .setDescription(
                    isReset
                        ? "The bot's profile picture has been reverted to its global default in this server."
                        : "The bot now has a custom profile picture in this server. Other servers are unaffected.",
                )
                .setThumbnail(newAvatarUrl)
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            const msg = err?.message ?? "Unknown error";
            return interaction.editReply({ content: `❌ Failed to update avatar: ${msg}` });
        }
    }

    if (sub === "banner") {
        const url = interaction.options.getString("url", true);
        const bannerUrl = url.toLowerCase() === "none" ? null : url;
        if (bannerUrl && !/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)/i.test(bannerUrl)) {
            return interaction.reply({ content: "❌ Please provide a valid image URL ending in `.png`, `.jpg`, `.gif`, or `.webp`.", flags: 64 });
        }
        await db.insert(serverCustomizationTable).values({ guildId, bannerUrl: bannerUrl ?? undefined })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { bannerUrl, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        const embed = new EmbedBuilder()
            .setColor((await getGuildStyle(guildId)).color)
            .setTitle("✅ Banner Updated")
            .setDescription(bannerUrl ? "Banner image set. It will appear in welcome messages and key embeds." : "Banner image removed.");
        if (bannerUrl) embed.setImage(bannerUrl);
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "nickname") {
        const name = interaction.options.getString("name", true);
        const botMember = interaction.guild.members.me;
        const newNick = name.toLowerCase() === "reset" ? null : name;
        await botMember.setNickname(newNick, `Changed by ${interaction.user.tag}`);
        return interaction.reply({
            content: newNick ? `✅ Nickname set to **${newNick}**.` : "✅ Nickname reset.",
            flags: 64,
        });
    }

    if (sub === "status") {
        const style = await getGuildStyle(guildId);
        const [config] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guildId));

        const colorHex = `#${style.color.toString(16).padStart(6, "0").toUpperCase()}`;
        const botMember = interaction.guild.members.me;
        const currentAvatarUrl = botMember.displayAvatarURL({ size: 256 });

        const embed = new EmbedBuilder()
            .setColor(style.color)
            .setTitle("⚙️ Server Customization Settings")
            .setThumbnail(currentAvatarUrl)
            .addFields(
                { name: "🎨 Embed Color", value: colorHex, inline: true },
                { name: "📝 Footer Text", value: style.footer ?? "*not set*", inline: true },
                { name: "🖼️ Banner", value: style.bannerUrl ? `[View image](${style.bannerUrl})` : "*not set*", inline: true },
                { name: "🤖 Server Avatar", value: botMember.avatar ? "Custom (server-specific)" : "Global default", inline: true },
                { name: "📛 Nickname", value: botMember.nickname ?? "*not set*", inline: true },
                { name: "👋 Welcome Channel", value: config?.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "*not set*", inline: true },
                { name: "👋 Welcome Message", value: config?.welcomeMessage ? config.welcomeMessage.slice(0, 80) + (config.welcomeMessage.length > 80 ? "…" : "") : "*default*", inline: false },
                { name: "🚪 Leave Channel", value: config?.leaveChannelId ? `<#${config.leaveChannelId}>` : "*not set*", inline: true },
                { name: "📋 Log Channel", value: config?.logChannelId ? `<#${config.logChannelId}>` : "*not set*", inline: true },
            )
            .setFooter({ text: "Use /customize <subcommand> to change any setting • /welcome • /logs" })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "reset") {
        await db.insert(serverCustomizationTable)
            .values({ guildId, embedColor: "5865f2", footerText: null, bannerUrl: null })
            .onConflictDoUpdate({
                target: serverCustomizationTable.guildId,
                set: { embedColor: "5865f2", footerText: null, bannerUrl: null, updatedAt: new Date() },
            });
        invalidateStyleCache(guildId);
        const botMember = interaction.guild.members.me;
        await botMember.setNickname(null).catch(() => {});
        await botMember.setAvatar(null).catch(() => {});
        return interaction.reply({ content: "✅ All customizations have been reset to default.", flags: 64 });
    }
}
