import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Routes } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle, invalidateStyleCache, hexToInt } from "../utils/guildStyle.js";
import { client } from "../index.js";

const VALID_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

async function imageToBase64(url, fallbackContentType = "image/png") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
    const contentType = res.headers.get("content-type")?.split(";")[0] ?? fallbackContentType;
    const buffer = await res.arrayBuffer();
    return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
}

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
        if (attachment && !VALID_IMAGE_TYPES.includes(attachment.contentType)) {
            return interaction.reply({ content: "❌ Please upload a PNG, JPG, GIF, or WebP image.", flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        try {
            let avatarData = null;
            if (!isReset) {
                const imageUrl = attachment?.url ?? urlInput;
                avatarData = await imageToBase64(imageUrl, attachment?.contentType ?? "image/png");
            }

            await client.rest.patch(Routes.guildMember(guildId, client.user.id), {
                body: { avatar: avatarData },
            });

            const botMember = await interaction.guild.members.fetch(client.user.id);
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
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
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
        const botMember = await interaction.guild.members.fetch(client.user.id);
        const currentAvatarUrl = botMember.displayAvatarURL({ size: 256 });

        const embed = new EmbedBuilder()
            .setColor(style.color)
            .setTitle("⚙️ Server Customization Settings")
            .setThumbnail(currentAvatarUrl)
            .addFields(
                { name: "🎨 Embed Color", value: colorHex, inline: true },
                { name: "📝 Footer Text", value: style.footer ?? "*not set*", inline: true },
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
            .values({ guildId, embedColor: "5865f2", footerText: null })
            .onConflictDoUpdate({
                target: serverCustomizationTable.guildId,
                set: { embedColor: "5865f2", footerText: null, updatedAt: new Date() },
            });
        invalidateStyleCache(guildId);
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        await botMember.setNickname(null).catch(() => {});
        await client.rest.patch(Routes.guildMember(guildId, client.user.id), {
            body: { avatar: null },
        }).catch(() => {});
        return interaction.reply({ content: "✅ All server customizations have been reset to default.", flags: 64 });
    }
}
