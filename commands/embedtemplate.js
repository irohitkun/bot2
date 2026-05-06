import {
    SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
    ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import {
    getTemplate, listTemplates, deleteTemplate, upsertTemplate,
    buildEmbedFromTemplate, applyVars,
} from "../utils/embedTemplates.js";

export const data = new SlashCommandBuilder()
    .setName("embedtemplate")
    .setDescription("Create and manage reusable embed templates for welcome, leave, and more")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) => sub
        .setName("create")
        .setDescription("Create a new embed template using an interactive form")
        .addStringOption((o) => o.setName("name").setDescription("Template name (alphanumeric, hyphens, underscores)").setRequired(true).setMaxLength(32)))
    .addSubcommand((sub) => sub
        .setName("edit")
        .setDescription("Edit an existing embed template")
        .addStringOption((o) => o.setName("name").setDescription("Name of the template to edit").setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub
        .setName("delete")
        .setDescription("Delete an embed template")
        .addStringOption((o) => o.setName("name").setDescription("Name of the template to delete").setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub
        .setName("list")
        .setDescription("List all embed templates in this server"))
    .addSubcommand((sub) => sub
        .setName("preview")
        .setDescription("Preview an embed template")
        .addStringOption((o) => o.setName("name").setDescription("Name of the template to preview").setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub
        .setName("addfield")
        .setDescription("Add a field to an embed template")
        .addStringOption((o) => o.setName("name").setDescription("Template name").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("field_name").setDescription("Field title (supports {user}, {server}, etc.)").setRequired(true).setMaxLength(256))
        .addStringOption((o) => o.setName("field_value").setDescription("Field value (supports variables)").setRequired(true).setMaxLength(1024))
        .addBooleanOption((o) => o.setName("inline").setDescription("Display field inline? (default: false)")))
    .addSubcommand((sub) => sub
        .setName("clearfields")
        .setDescription("Remove all fields from an embed template")
        .addStringOption((o) => o.setName("name").setDescription("Template name").setRequired(true).setAutocomplete(true)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const { color } = await getGuildStyle(guildId);

    // ── Autocomplete ──────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused().toLowerCase();
        const templates = await listTemplates(guildId);
        const choices = templates
            .filter((t) => t.name.startsWith(focused))
            .slice(0, 25)
            .map((t) => ({ name: t.name, value: t.name }));
        return interaction.respond(choices);
    }

    // ── Create ────────────────────────────────────────────────────────────────
    if (sub === "create") {
        const rawName = interaction.options.getString("name", true);
        const name = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
        if (!name) return interaction.reply({ content: "❌ Invalid template name. Use letters, numbers, hyphens, and underscores only.", flags: 64 });

        const existing = await getTemplate(guildId, name);
        if (existing) {
            return interaction.reply({ content: `❌ A template named \`${name}\` already exists. Use \`/embedtemplate edit\` to modify it.`, flags: 64 });
        }
        return interaction.showModal(buildModal("embedtemplate:create:" + name, "Create Embed Template: " + name, null));
    }

    // ── Edit ──────────────────────────────────────────────────────────────────
    if (sub === "edit") {
        const name = interaction.options.getString("name", true).toLowerCase();
        const existing = await getTemplate(guildId, name);
        if (!existing) {
            return interaction.reply({ content: `❌ No template named \`${name}\` found. Use \`/embedtemplate list\` to see all templates.`, flags: 64 });
        }
        return interaction.showModal(buildModal("embedtemplate:edit:" + name, "Edit Template: " + name, existing));
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    if (sub === "delete") {
        const name = interaction.options.getString("name", true).toLowerCase();
        const deleted = await deleteTemplate(guildId, name);
        if (!deleted) return interaction.reply({ content: `❌ No template named \`${name}\` found.`, flags: 64 });
        return interaction.reply({ content: `🗑️ Template \`${name}\` deleted.`, flags: 64 });
    }

    // ── List ──────────────────────────────────────────────────────────────────
    if (sub === "list") {
        const templates = await listTemplates(guildId);
        if (templates.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(color).setTitle("📋 Embed Templates")
                    .setDescription("No templates created yet.\n\nUse `/embedtemplate create` to create your first template.")],
                flags: 64,
            });
        }
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`📋 Embed Templates (${templates.length})`)
            .setDescription(
                templates.map((t) =>
                    `\`${t.name}\` — ${t.title ? `"${t.title.slice(0, 40)}"` : "_(no title)_"} · ${t.description ? t.description.slice(0, 60) + "…" : "_(no description)_"}`
                ).join("\n")
            )
            .setFooter({ text: "Use /embedtemplate preview <name> to see any template" })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ── Preview ───────────────────────────────────────────────────────────────
    if (sub === "preview") {
        const name = interaction.options.getString("name", true).toLowerCase();
        const template = await getTemplate(guildId, name);
        if (!template) return interaction.reply({ content: `❌ No template named \`${name}\` found.`, flags: 64 });

        const { color: fallbackColor } = await getGuildStyle(guildId);
        const previewVars = {
            userMention: interaction.user.toString(),
            userName: interaction.user.username,
            userTag: interaction.user.tag,
            userAvatar: interaction.user.displayAvatarURL({ size: 256 }),
            serverName: interaction.guild.name,
            serverIcon: interaction.guild.iconURL({ size: 256 }) ?? "",
            count: interaction.guild.memberCount,
        };
        const embed = buildEmbedFromTemplate(template, previewVars, fallbackColor);
        return interaction.reply({
            content: `📋 **Preview of template \`${name}\`** (variables filled with your data for illustration)`,
            embeds: [embed],
            flags: 64,
        });
    }

    // ── Add Field ─────────────────────────────────────────────────────────────
    if (sub === "addfield") {
        const name = interaction.options.getString("name", true).toLowerCase();
        const fieldName = interaction.options.getString("field_name", true);
        const fieldValue = interaction.options.getString("field_value", true);
        const inline = interaction.options.getBoolean("inline") ?? false;

        const template = await getTemplate(guildId, name);
        if (!template) return interaction.reply({ content: `❌ No template named \`${name}\` found.`, flags: 64 });

        let fields = [];
        if (template.fieldsJson) {
            try { fields = JSON.parse(template.fieldsJson); } catch {}
        }
        if (fields.length >= 25) return interaction.reply({ content: "❌ Embeds can have at most 25 fields.", flags: 64 });
        fields.push({ name: fieldName, value: fieldValue, inline });

        await upsertTemplate(guildId, name, { ...template, fieldsJson: JSON.stringify(fields) }, template.createdBy);
        return interaction.reply({ content: `✅ Field added to \`${name}\`. Template now has **${fields.length}** field(s). Use \`/embedtemplate preview ${name}\` to verify.`, flags: 64 });
    }

    // ── Clear Fields ──────────────────────────────────────────────────────────
    if (sub === "clearfields") {
        const name = interaction.options.getString("name", true).toLowerCase();
        const template = await getTemplate(guildId, name);
        if (!template) return interaction.reply({ content: `❌ No template named \`${name}\` found.`, flags: 64 });
        await upsertTemplate(guildId, name, { ...template, fieldsJson: null }, template.createdBy);
        return interaction.reply({ content: `✅ All fields cleared from template \`${name}\`.`, flags: 64 });
    }
}

/** Build the 5-field embed template modal */
function buildModal(customId, title, existing) {
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title.slice(0, 45))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("embed_title")
                    .setLabel("Title (optional, supports {user}, {server})")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(256)
                    .setRequired(false)
                    .setValue(existing?.title ?? ""),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("embed_description")
                    .setLabel("Description (supports {user}, {server}, {count})")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(4000)
                    .setRequired(true)
                    .setValue(existing?.description ?? ""),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("embed_color")
                    .setLabel("Color (hex, e.g. FF5733 — leave blank for server color)")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(7)
                    .setRequired(false)
                    .setValue(existing?.color ?? ""),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("embed_footer")
                    .setLabel("Footer text (optional, supports variables)")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setValue(existing?.footerText ?? ""),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("embed_thumbnail")
                    .setLabel("Thumbnail URL ({user_avatar} or {server_icon} or URL)")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(500)
                    .setRequired(false)
                    .setValue(existing?.thumbnailUrl ?? ""),
            ),
        );
}
