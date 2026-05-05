import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, customCommandsTable } from "../db/index.js";
import { and, eq, desc, sql } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { isPremium, premiumDeniedEmbed } from "../utils/permissions.js";

export const data = new SlashCommandBuilder()
    .setName("customcmd")
    .setDescription("Create server-specific commands that only your server has (premium)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
        sub.setName("add")
            .setDescription("Create a custom command")
            .addStringOption((o) => o.setName("name").setDescription("Command name (no spaces, used as %name or /name)").setRequired(true).setMaxLength(30))
            .addStringOption((o) => o.setName("response").setDescription("What the bot replies with (markdown supported)").setRequired(true).setMaxLength(2000)))
    .addSubcommand((sub) =>
        sub.setName("edit")
            .setDescription("Edit an existing custom command's response")
            .addStringOption((o) => o.setName("name").setDescription("Command name").setRequired(true))
            .addStringOption((o) => o.setName("response").setDescription("New response").setRequired(true).setMaxLength(2000)))
    .addSubcommand((sub) =>
        sub.setName("delete")
            .setDescription("Delete a custom command")
            .addStringOption((o) => o.setName("name").setDescription("Command name").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("List all custom commands for this server"))
    .addSubcommand((sub) =>
        sub.setName("info")
            .setDescription("View a custom command's full response and stats")
            .addStringOption((o) => o.setName("name").setDescription("Command name").setRequired(true)));

export async function execute(interaction) {
    if (!await isPremium(interaction.guild.id)) {
        return interaction.reply({ embeds: [premiumDeniedEmbed("Custom Commands")], flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "add")    return handleAdd(interaction);
    if (sub === "edit")   return handleEdit(interaction);
    if (sub === "delete") return handleDelete(interaction);
    if (sub === "list")   return handleList(interaction);
    if (sub === "info")   return handleInfo(interaction);
}

async function handleAdd(interaction) {
    const name = interaction.options.getString("name", true).toLowerCase().trim().replace(/\s+/g, "-");
    const response = interaction.options.getString("response", true);
    const { color } = await getGuildStyle(interaction.guild.id);

    // Block names that conflict with built-in commands
    const RESERVED = new Set(["help","ban","kick","mute","warn","purge","lock","unlock","ai","ping","daily","rank","tag","sticky","schedule","j2c","starboard","birthday","customcmd","premium","role","massrole"]);
    if (RESERVED.has(name)) {
        return interaction.reply({ content: `❌ \`${name}\` is a built-in command name and cannot be used.`, flags: 64 });
    }

    const existing = await db.select().from(customCommandsTable)
        .where(and(eq(customCommandsTable.guildId, interaction.guild.id), eq(customCommandsTable.name, name)));
    if (existing.length > 0) {
        return interaction.reply({ content: `❌ Custom command \`${name}\` already exists. Use \`/customcmd edit\` to update it.`, flags: 64 });
    }

    await db.insert(customCommandsTable).values({
        guildId: interaction.guild.id,
        name,
        response,
        createdBy: interaction.user.id,
    });

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("✅ Custom Command Created")
            .addFields({ name: "Name", value: `\`${name}\``, inline: true }, { name: "Trigger", value: `\`${name}\` (prefix or slash)`, inline: true })
            .setDescription(response.length > 300 ? response.slice(0, 300) + "…" : response)
            .setFooter({ text: "Members can use it with your server prefix or /customcmd isn't needed — just type the command name" })],
        flags: 64,
    });
}

async function handleEdit(interaction) {
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const response = interaction.options.getString("response", true);
    const result = await db.update(customCommandsTable)
        .set({ response })
        .where(and(eq(customCommandsTable.guildId, interaction.guild.id), eq(customCommandsTable.name, name)))
        .returning();
    if (result.length === 0) return interaction.reply({ content: `❌ No custom command named \`${name}\`.`, flags: 64 });
    return interaction.reply({ content: `✅ Custom command \`${name}\` updated.`, flags: 64 });
}

async function handleDelete(interaction) {
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const result = await db.delete(customCommandsTable)
        .where(and(eq(customCommandsTable.guildId, interaction.guild.id), eq(customCommandsTable.name, name)))
        .returning();
    if (result.length === 0) return interaction.reply({ content: `❌ No custom command named \`${name}\`.`, flags: 64 });
    return interaction.reply({ content: `✅ Custom command \`${name}\` deleted.`, flags: 64 });
}

async function handleList(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const cmds = await db.select().from(customCommandsTable)
        .where(eq(customCommandsTable.guildId, interaction.guild.id))
        .orderBy(desc(customCommandsTable.uses));

    if (cmds.length === 0) {
        return interaction.reply({ content: "No custom commands yet. Create one with `/customcmd add`.", flags: 64 });
    }

    const lines = cmds.map((c) => `\`${c.name}\` · ${c.uses} use${c.uses !== 1 ? "s" : ""}`);
    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`⚙️ Custom Commands (${cmds.length})`)
            .setDescription(lines.join("\n").slice(0, 4000))
            .setFooter({ text: "Members trigger these with your server prefix" })],
        flags: 64,
    });
}

async function handleInfo(interaction) {
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const { color } = await getGuildStyle(interaction.guild.id);
    const [cmd] = await db.select().from(customCommandsTable)
        .where(and(eq(customCommandsTable.guildId, interaction.guild.id), eq(customCommandsTable.name, name)));
    if (!cmd) return interaction.reply({ content: `❌ No custom command named \`${name}\`.`, flags: 64 });

    const creator = await interaction.client.users.fetch(cmd.createdBy).catch(() => null);
    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`⚙️ Custom Command: ${name}`)
            .addFields(
                { name: "Uses", value: `${cmd.uses}`, inline: true },
                { name: "Created By", value: creator?.tag ?? `<@${cmd.createdBy}>`, inline: true },
                { name: "Created", value: `<t:${Math.floor(cmd.createdAt.getTime() / 1000)}:R>`, inline: true },
                { name: "Response", value: cmd.response.slice(0, 1024) },
            )],
        flags: 64,
    });
}
