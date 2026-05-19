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
        sub.setName("avatar")
            .setDescription("Set a custom profile picture for the bot in this server (Premium)")
            .addAttachmentOption((opt) =>
                opt.setName("image").setDescription("Upload an image — PNG, JPG, or GIF").setRequired(false))
            .addStringOption((opt) =>
                opt.setName("url").setDescription("Or paste an image URL instead. Use 'reset' to revert.").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("banner")
            .setDescription("Set the bot's global profile banner — shown on the bot's Discord profile (Bot Owner only)")
            .addAttachmentOption((opt) =>
                opt.setName("image").setDescription("Upload an image — PNG, JPG, or GIF").setRequired(false))
            .addStringOption((opt) =>
                opt.setName("url").setDescription("Or paste an image URL instead. Use 'reset' to remove.").setRequired(false)))
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

    // ── Bot-owner-only: banner ────────────────────────────────────────────────
    if (sub === "banner") {
        if (!BOT_OWNER_IDS.includes(interaction.user.id)) {
            return interaction.reply({ content: "❌ Only bot owners can change the bot's global profile banner.", flags: 64 });
        }

        const attachment = interaction.options.getAttachment("image");
        const urlInput = interaction.options.getString("url");
        const isReset = urlInput?.toLowerCase() === "reset";

        if (!attachment && !urlInput) {
            return interaction.reply({ content: "❌ Please upload an image or provide a URL. Use `reset` to remove the banner.", flags: 64 });
        }

        if (attachment) {
            const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
            if (!validTypes.includes(attachment.contentType)) {
                return interaction.reply({ content: "❌ Please upload a PNG, JPG, GIF, or WebP image.", flags: 64 });
            }
        }

        const imageUrl = attachment?.url ?? urlInput;

        await interaction.deferReply({ flags: 64 });

        try {
            await client.user.setBanner(isReset ? null : imageUrl);
            // Fetch fresh user data so the banner URL is up to date
            await client.user.fetch(true);

            const bannerUrl = client.user.bannerURL({ size: 1024 });
            const style = await getGuildStyle(guildId);
            const embed = new EmbedBuilder()
                .setColor(style.color)
                .setTitle(isReset ? "✅ Profile Banner Removed" : "✅ Profile Banner Updated")
                .setDescription(
                    isReset
                        ? "The bot's profile banner has been removed globally."
                        : "The bot's profile banner has been updated. It appears when someone clicks the bot's profile in any server.",
                )
                .setFooter({ text: "Note: Discord rate-limits banner changes to ~2 per hour." })
                .setTimestamp();
            if (bannerUrl) embed.setImage(bannerUrl);
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            const msg = err?.message?.toLowerCase() ?? "";
            if (msg.includes("rate")) {
                return interaction.editReply({ content: "❌ Rate limited by Discord. You can only change the banner a couple of times per hour — try again later." });
            }
            return interaction.editReply({ content: `❌ Failed to update banner: ${err?.message ?? "Unknown error"}` });
        }
    }

    // ── Premium-only subcommands ──────────────────────────────────────────────
    if (sub === "avatar" || sub === "nickname") {
        const { isPremiumGuild, premiumDeniedEmbed } = await import("../utils/permissions.js");
        const premium = await isPremiumGuild(guildId);
        if (!premium) {
            return interaction.reply({ embeds: [premiumDeniedEmbed("Server Customization (avatar/nickname)")], flags: 64 });
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
        const attachment = interaction.options.getAttachment("image");
        const urlInput = interaction.options.getString("url");
        const isReset = urlInput?.toLowerCase() === "reset";

        if (!attachment && !urlInput) {
            return interaction.reply({ content: "❌ Please upload an image or provide a URL. Use `reset` to revert to the global avatar.", flags: 64 });
        }

        if (attachment) {
            const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
            if (!validTypes.includes(attachment.contentType)) {
                return interaction.reply({ content: "❌ Please upload a PNG, JPG, GIF, or WebP image.", flags: 64 });
            }
        }

        const imageUrl = attachment?.url ?? urlInput;

        await interaction.deferReply({ flags: 64 });

        try {
            const botMember = interaction.guild.members.me;
            await botMember.setAvatar(isReset ? null : imageUrl);

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
            return interaction.editReply({ content: `❌ Failed to update avatar: ${err?.message ?? "Unknown error"}` });
        }
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
        const botUser = await client.user.fetch(true);
        const currentAvatarUrl = botMember.displayAvatarURL({ size: 256 });
        const bannerUrl = botUser.bannerURL({ size: 1024 });

        const embed = new EmbedBuilder()
            .setColor(style.color)
            .setTitle("⚙️ Server Customization Settings")
            .setThumbnail(currentAvatarUrl)
            .addFields(
                { name: "🎨 Embed Color", value: colorHex, inline: true },
                { name: "📝 Footer Text", value: style.footer ?? "*not set*", inline: true },
                { name: "🖼️ Profile Banner", value: bannerUrl ? `[View banner](${bannerUrl})` : "*not set*", inline: true },
                { name: "🤖 Server Avatar", value: botMember.avatar ? "Custom (server-specific)" : "Global default", inline: true },
                { name: "📛 Nickname", value: botMember.nickname ?? "*not set*", inline: true },
                { name: "👋 Welcome Channel", value: config?.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "*not set*", inline: true },
                { name: "👋 Welcome Message", value: config?.welcomeMessage ? config.welcomeMessage.slice(0, 80) + (config.welcomeMessage.length > 80 ? "…" : "") : "*default*", inline: false },
                { name: "🚪 Leave Channel", value: config?.leaveChannelId ? `<#${config.leaveChannelId}>` : "*not set*", inline: true },
                { name: "📋 Log Channel", value: config?.logChannelId ? `<#${config.logChannelId}>` : "*not set*", inline: true },
            )
            .setFooter({ text: "Use /customize <subcommand> to change any setting • /welcome • /logs" })
            .setTimestamp();
        if (bannerUrl) embed.setImage(bannerUrl);

        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "reset") {
        await db.insert(serverCustomizationTable)
            .values({ guildId, embedColor: "5865f2", footerText: null })
            .onConflictDoUpdate({
                target: serverCustomizationTable.guildId,
                set: { embedColor: "5865f2", footerText: null, updatedAt: new Date() },
            });
        invalidateStyleCache(guildId);
        const botMember = interaction.guild.members.me;
        await botMember.setNickname(null).catch(() => {});
        await botMember.setAvatar(null).catch(() => {});
        return interaction.reply({ content: "✅ All server customizations have been reset to default.", flags: 64 });
    }
}
