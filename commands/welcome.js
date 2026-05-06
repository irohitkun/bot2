import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { invalidateStyleCache, getGuildStyle } from "../utils/guildStyle.js";
import { getTemplate, buildEmbedFromTemplate, varsFromMember } from "../utils/embedTemplates.js";

export const data = new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure welcome and goodbye messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // Welcome subcommands
    .addSubcommand((sub) => sub
        .setName("set")
        .setDescription("Set the welcome channel and message")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to send welcome messages in").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Welcome message. Use {user}, {server}, {count}").setRequired(false).setMaxLength(500))
        .addStringOption((o) => o.setName("embed_template").setDescription("Use a saved embed template instead of the default embed (created via /embedtemplate)").setRequired(false).setAutocomplete(true)))
    .addSubcommand((sub) => sub.setName("test").setDescription("Send a test welcome message to the configured channel"))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable welcome messages"))
    // Leave/goodbye subcommands
    .addSubcommand((sub) => sub
        .setName("setleave")
        .setDescription("Set the leave/goodbye channel and message")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to send leave messages in").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Leave message. Use {user.name}, {server}, {count}").setRequired(false).setMaxLength(500))
        .addStringOption((o) => o.setName("embed_template").setDescription("Use a saved embed template instead of the default embed").setRequired(false).setAutocomplete(true)))
    .addSubcommand((sub) => sub.setName("testleave").setDescription("Send a test leave message"))
    .addSubcommand((sub) => sub.setName("disableleave").setDescription("Disable leave/goodbye messages"));

export async function execute(interaction) {
    // Autocomplete for embed_template option
    if (interaction.isAutocomplete()) {
        const { listTemplates } = await import("../utils/embedTemplates.js");
        const focused = interaction.options.getFocused().toLowerCase();
        const templates = await listTemplates(interaction.guild.id);
        return interaction.respond(
            templates.filter((t) => t.name.startsWith(focused)).slice(0, 25).map((t) => ({ name: t.name, value: t.name }))
        );
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        const message = interaction.options.getString("message") ?? "👋 Welcome to **{server}**, {user}! You are member **#{count}**.";
        const embedTemplate = interaction.options.getString("embed_template");

        if (embedTemplate) {
            const tpl = await getTemplate(guildId, embedTemplate);
            if (!tpl) {
                return interaction.reply({ content: `❌ No embed template named \`${embedTemplate}\` found. Create one with \`/embedtemplate create\`.`, flags: 64 });
            }
        }

        await db.insert(serverCustomizationTable).values({
            guildId, welcomeChannelId: channel.id, welcomeMessage: message,
            welcomeEmbedTemplate: embedTemplate ?? null,
        }).onConflictDoUpdate({
            target: serverCustomizationTable.guildId,
            set: { welcomeChannelId: channel.id, welcomeMessage: message, welcomeEmbedTemplate: embedTemplate ?? null, updatedAt: new Date() },
        });
        invalidateStyleCache(guildId);

        const msg = embedTemplate
            ? `✅ Welcome messages will be sent to <#${channel.id}> using embed template \`${embedTemplate}\`.`
            : `✅ Welcome messages will be sent to <#${channel.id}>.\nMessage preview:\n> ${message}`;
        return interaction.reply({ content: msg, flags: 64 });
    }

    if (sub === "test") {
        const [config] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guildId));
        if (!config?.welcomeChannelId) {
            return interaction.reply({ content: "❌ No welcome channel configured. Use `/welcome set` first.", flags: 64 });
        }
        const channel = interaction.guild.channels.cache.get(config.welcomeChannelId);
        if (!channel) return interaction.reply({ content: "❌ Welcome channel not found.", flags: 64 });

        const style = await getGuildStyle(guildId);
        const member = interaction.guild.members.me;
        const vars = varsFromMember(member);

        let embed;
        if (config.welcomeEmbedTemplate) {
            const tpl = await getTemplate(guildId, config.welcomeEmbedTemplate);
            if (tpl) {
                embed = buildEmbedFromTemplate(tpl, vars, style.color);
            }
        }
        if (!embed) {
            const template = config.welcomeMessage ?? "👋 Welcome to **{server}**, {user}! You are member **#{count}**.";
            const { applyVars } = await import("../utils/embedTemplates.js");
            const text = applyVars(template, vars);
            embed = new EmbedBuilder()
                .setColor(style.color)
                .setTitle("👋 Welcome!")
                .setDescription(text)
                .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                .setFooter(style.footer ? { text: style.footer } : { text: interaction.guild.name })
                .setTimestamp();
        }
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: `✅ Test welcome message sent to <#${channel.id}>.`, flags: 64 });
    }

    if (sub === "disable") {
        await db.insert(serverCustomizationTable).values({ guildId, welcomeChannelId: null, welcomeEmbedTemplate: null })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { welcomeChannelId: null, welcomeEmbedTemplate: null, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({ content: "✅ Welcome messages disabled.", flags: 64 });
    }

    if (sub === "setleave") {
        const channel = interaction.options.getChannel("channel", true);
        const message = interaction.options.getString("message") ?? "👋 **{user.name}** has left **{server}**. We now have **{count}** members.";
        const embedTemplate = interaction.options.getString("embed_template");

        if (embedTemplate) {
            const tpl = await getTemplate(guildId, embedTemplate);
            if (!tpl) {
                return interaction.reply({ content: `❌ No embed template named \`${embedTemplate}\` found.`, flags: 64 });
            }
        }

        await db.insert(serverCustomizationTable).values({
            guildId, leaveChannelId: channel.id, leaveMessage: message,
            leaveEmbedTemplate: embedTemplate ?? null,
        }).onConflictDoUpdate({
            target: serverCustomizationTable.guildId,
            set: { leaveChannelId: channel.id, leaveMessage: message, leaveEmbedTemplate: embedTemplate ?? null, updatedAt: new Date() },
        });
        invalidateStyleCache(guildId);

        const msg = embedTemplate
            ? `✅ Leave messages will be sent to <#${channel.id}> using embed template \`${embedTemplate}\`.`
            : `✅ Leave messages will be sent to <#${channel.id}>.\nMessage preview:\n> ${message}`;
        return interaction.reply({ content: msg, flags: 64 });
    }

    if (sub === "testleave") {
        const [config] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guildId));
        if (!config?.leaveChannelId) {
            return interaction.reply({ content: "❌ No leave channel configured. Use `/welcome setleave` first.", flags: 64 });
        }
        const channel = interaction.guild.channels.cache.get(config.leaveChannelId);
        if (!channel) return interaction.reply({ content: "❌ Leave channel not found.", flags: 64 });

        const style = await getGuildStyle(guildId);
        const member = interaction.guild.members.me;
        const vars = varsFromMember(member);

        let embed;
        if (config.leaveEmbedTemplate) {
            const tpl = await getTemplate(guildId, config.leaveEmbedTemplate);
            if (tpl) embed = buildEmbedFromTemplate(tpl, vars, style.color);
        }
        if (!embed) {
            const { applyVars } = await import("../utils/embedTemplates.js");
            const text = applyVars(config.leaveMessage ?? "👋 **{user.name}** has left **{server}**. We now have **{count}** members.", vars);
            embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("👋 Member Left")
                .setDescription(text)
                .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                .setTimestamp();
        }
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: `✅ Test leave message sent to <#${channel.id}>.`, flags: 64 });
    }

    if (sub === "disableleave") {
        await db.insert(serverCustomizationTable).values({ guildId, leaveChannelId: null, leaveEmbedTemplate: null })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { leaveChannelId: null, leaveEmbedTemplate: null, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({ content: "✅ Leave messages disabled.", flags: 64 });
    }
}
