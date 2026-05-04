import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, memberNotesTable } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("note")
    .setDescription("Staff-only notes on members — visible only to staff, never shown to the member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
        sub.setName("add")
            .setDescription("Add a staff note to a member")
            .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true))
            .addStringOption((o) => o.setName("text").setDescription("Note content (max 1000 chars)").setRequired(true).setMaxLength(1000)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("View all notes for a member")
            .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("delete")
            .setDescription("Delete a note by its ID")
            .addIntegerOption((o) => o.setName("id").setDescription("Note ID shown in /note list").setRequired(true)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "add")    return handleAdd(interaction);
    if (sub === "list")   return handleList(interaction);
    if (sub === "delete") return handleDelete(interaction);
}

async function handleAdd(interaction) {
    const user = interaction.options.getUser("user", true);
    const text = interaction.options.getString("text", true);
    const { color } = await getGuildStyle(interaction.guild.id);

    const [note] = await db.insert(memberNotesTable).values({
        guildId: interaction.guild.id,
        userId: user.id,
        authorId: interaction.user.id,
        authorTag: interaction.user.tag,
        note: text,
    }).returning();

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("📝 Note Added")
        .addFields(
            { name: "Member", value: `${user.tag} (${user.id})`, inline: true },
            { name: "Note ID", value: `#${note.id}`, inline: true },
            { name: "Added By", value: interaction.user.tag, inline: true },
            { name: "Content", value: text },
        )
        .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleList(interaction) {
    const user = interaction.options.getUser("user", true);
    const { color } = await getGuildStyle(interaction.guild.id);

    const notes = await db.select().from(memberNotesTable)
        .where(and(eq(memberNotesTable.guildId, interaction.guild.id), eq(memberNotesTable.userId, user.id)))
        .orderBy(desc(memberNotesTable.createdAt));

    if (notes.length === 0) {
        return interaction.reply({ content: `📝 No notes on **${user.tag}**.`, flags: 64 });
    }

    const lines = notes.map((n) =>
        `**#${n.id}** · <t:${Math.floor(n.createdAt.getTime() / 1000)}:d> · by ${n.authorTag}\n${n.note}`
    );

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`📝 Notes — ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(lines.join("\n\n").slice(0, 4000))
        .setFooter({ text: `${notes.length} note(s) total — use /note delete <id> to remove one` })
        .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleDelete(interaction) {
    const id = interaction.options.getInteger("id", true);

    const [note] = await db.select().from(memberNotesTable)
        .where(and(eq(memberNotesTable.id, id), eq(memberNotesTable.guildId, interaction.guild.id)));

    if (!note) return interaction.reply({ content: `❌ Note #${id} not found in this server.`, flags: 64 });

    await db.delete(memberNotesTable).where(eq(memberNotesTable.id, id));
    return interaction.reply({ content: `✅ Note **#${id}** deleted.`, flags: 64 });
}
