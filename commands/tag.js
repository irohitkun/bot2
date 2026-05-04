import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, tagsTable } from "../db/index.js";
import { and, eq, desc, sql } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Server tags — quick-access canned responses for staff")
    .addSubcommand((sub) =>
        sub.setName("use")
            .setDescription("Post a tag's content in this channel")
            .addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true).setMaxLength(50)))
    .addSubcommand((sub) =>
        sub.setName("add")
            .setDescription("Create a new tag")
            .addStringOption((o) => o.setName("name").setDescription("Tag name (one word, no spaces)").setRequired(true).setMaxLength(50))
            .addStringOption((o) => o.setName("content").setDescription("Tag content (supports markdown)").setRequired(true).setMaxLength(2000)))
    .addSubcommand((sub) =>
        sub.setName("edit")
            .setDescription("Edit an existing tag's content")
            .addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true).setMaxLength(50))
            .addStringOption((o) => o.setName("content").setDescription("New content").setRequired(true).setMaxLength(2000)))
    .addSubcommand((sub) =>
        sub.setName("delete")
            .setDescription("Delete a tag")
            .addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true).setMaxLength(50)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("List all tags in this server"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "use")    return handleUse(interaction);
    if (sub === "add")    return handleAdd(interaction);
    if (sub === "edit")   return handleEdit(interaction);
    if (sub === "delete") return handleDelete(interaction);
    if (sub === "list")   return handleList(interaction);
}

async function handleUse(interaction) {
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const [tag] = await db.select().from(tagsTable)
        .where(and(eq(tagsTable.guildId, interaction.guild.id), eq(tagsTable.name, name)));
    if (!tag) return interaction.reply({ content: `❌ No tag named \`${name}\`. Use \`/tag list\` to see all tags.`, flags: 64 });

    await db.update(tagsTable)
        .set({ uses: sql`${tagsTable.uses} + 1` })
        .where(eq(tagsTable.id, tag.id));

    return interaction.reply({ content: tag.content });
}

async function handleAdd(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: "❌ You need **Manage Messages** permission to create tags.", flags: 64 });
    }
    const name = interaction.options.getString("name", true).toLowerCase().trim().replace(/\s+/g, "-");
    const content = interaction.options.getString("content", true);
    const { color } = await getGuildStyle(interaction.guild.id);

    const existing = await db.select().from(tagsTable)
        .where(and(eq(tagsTable.guildId, interaction.guild.id), eq(tagsTable.name, name)));
    if (existing.length > 0) return interaction.reply({ content: `❌ Tag \`${name}\` already exists. Use \`/tag edit\` to update it.`, flags: 64 });

    await db.insert(tagsTable).values({
        guildId: interaction.guild.id,
        name,
        content,
        createdBy: interaction.user.id,
        createdByTag: interaction.user.tag,
    });

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("🏷️ Tag Created")
            .addFields({ name: "Name", value: `\`${name}\``, inline: true }, { name: "Created By", value: interaction.user.tag, inline: true })
            .setDescription(content.length > 200 ? content.slice(0, 200) + "…" : content)
            .setFooter({ text: "Use /tag use <name> to post it" })],
        flags: 64,
    });
}

async function handleEdit(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: "❌ You need **Manage Messages** permission.", flags: 64 });
    }
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const content = interaction.options.getString("content", true);

    const result = await db.update(tagsTable)
        .set({ content, updatedAt: new Date() })
        .where(and(eq(tagsTable.guildId, interaction.guild.id), eq(tagsTable.name, name)))
        .returning();
    if (result.length === 0) return interaction.reply({ content: `❌ Tag \`${name}\` not found.`, flags: 64 });
    return interaction.reply({ content: `✅ Tag \`${name}\` updated.`, flags: 64 });
}

async function handleDelete(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: "❌ You need **Manage Messages** permission.", flags: 64 });
    }
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const result = await db.delete(tagsTable)
        .where(and(eq(tagsTable.guildId, interaction.guild.id), eq(tagsTable.name, name)))
        .returning();
    if (result.length === 0) return interaction.reply({ content: `❌ Tag \`${name}\` not found.`, flags: 64 });
    return interaction.reply({ content: `✅ Tag \`${name}\` deleted.`, flags: 64 });
}

async function handleList(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const tags = await db.select().from(tagsTable)
        .where(eq(tagsTable.guildId, interaction.guild.id))
        .orderBy(desc(tagsTable.uses));

    if (tags.length === 0) return interaction.reply({ content: "No tags created yet. Use `/tag add` to create one.", flags: 64 });

    const lines = tags.map((t) => `\`${t.name}\` · ${t.uses} use${t.uses !== 1 ? "s" : ""}`);
    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`🏷️ Tags (${tags.length})`)
            .setDescription(lines.join("\n").slice(0, 4000))
            .setFooter({ text: "Use /tag use <name> to post any tag" })],
        flags: 64,
    });
}
