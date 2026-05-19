import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle, invalidateStyleCache, hexToInt } from "../utils/guildStyle.js";
import { client } from "../index.js";

const BOT_OWNER_IDS = process.env.BOT_OWNERS?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];

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
        sub.setName("nickname")
            .setDescription("Set the bot's nickname in this server (Premium)")
            .addStringOption((opt) =>
                opt.setName("name").setDescription("Nickname, or 'reset' to remove").setRequired(true).setMaxLength(32)))
    .addSubcommand((sub) =>
        sub.setName("avatar")
            .setDescription("Change the bot's global profile picture (Bot Owner only)")
            .addStringOption((opt) =>
                opt.setName("url").setDescription("Image URL (https://...) — PNG, JPG, GIF supported").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("status")
            .setDescription("View all current customization and server settings"))
    .addSubcommand((sub) =>
        sub.setName("reset")
            .setDescription("Reset all customizations to default"));

export async function execute(interaction) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    // ── Bot-owner-only subcommands ─────────────────────────────────────────────
    if (sub === "avatar") {
        if (!BOT_OWNER_IDS.includes(interaction.user.id)) {
            return interaction.reply({ content: "❌ Only bot owners can change the bot's profile picture.", flags: 64 });
        }
        const url = interaction.options.getString("url", true);
        if (!/^https?:\/\/.+/i.test(url)) {
            return interaction.reply({ content: "❌ Please provide a valid image URL starting with `https://`.", flags: 64 });
        }
        await interaction.deferReply({ flags: 64 });
        try {
            await client.user.setAvatar(url);
            const embed = new EmbedBuilder()
                .setColor((await getGuildStyle(guildId)).color)
                .setTitle("✅ Bot Avatar Updated")
                .setDescription("The bot's profile picture has been updated globally across all servers.")
                .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
                .setFooter({ text: "Note: Discord rate-limits avatar changes to ~2 per hour." })
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            const msg = err?.message?.toLowerCase() ?? "";
            if (msg.includes("rate")) {
                return interaction.editReply({ content: "❌ Rate limited by Discord. You can only change the avatar a couple of times per hour — try again later." });
            }
            return interaction.editReply({ content: `❌ Failed to update avatar: ${err?.message ?? "unknown error"}` });
        }
    }

    // ── Premium-only subcommands ──────────────────────────────────────────────
    if (sub === "banner" || sub === "nickname") {
        const { isPremiumGuild, premiumDeniedEmbed } = await import("../utils/permissions.js");
        const premium = await isPremiumGuild(guildId);
        if (!premium) {
            return interaction.reply({ embeds: [premiumDeniedEmbed("Server Customization (banner/nickname)")], flags: 64 });
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

        const embed = new EmbedBuilder()
            .setColor(style.color)
            .setTitle("⚙️ Server Customization Settings")
            .setThumbnail(style.bannerUrl ?? client.user.displayAvatarURL({ size: 256 }))
            .addFields(
                { name: "🎨 Embed Color", value: colorHex, inline: true },
                { name: "📝 Footer Text", value: style.footer ?? "*not set*", inline: true },
                { name: "🖼️ Banner URL", value: style.bannerUrl ? `[View image](${style.bannerUrl})` : "*not set*", inline: true },
                { name: "👋 Welcome Channel", value: config?.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "*not set*", inline: true },
                { name: "👋 Welcome Message", value: config?.welcomeMessage ? config.welcomeMessage.slice(0, 80) + (config.welcomeMessage.length > 80 ? "…" : "") : "*default*", inline: false },
                { name: "🚪 Leave Channel", value: config?.leaveChannelId ? `<#${config.leaveChannelId}>` : "*not set*", inline: true },
                { name: "📋 Log Channel", value: config?.logChannelId ? `<#${config.logChannelId}>` : "*not set*", inline: true },
            )
            .setFooter({ text: "Use /customize <subcommand> to change any setting • /welcome to set welcome/leave • /logs to set log channel" })
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
        return interaction.reply({ content: "✅ All customizations have been reset to default.", flags: 64 });
    }
}
