import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, afkUsersTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
export const data = new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set or remove your AFK status")
    .addSubcommand((sub) => sub.setName("set").setDescription("Set yourself as AFK")
    .addStringOption((opt) => opt.setName("reason").setDescription("AFK reason").setRequired(false)))
    .addSubcommand((sub) => sub.setName("remove").setDescription("Remove your AFK status"));
export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    if (sub === "set") {
        const reason = interaction.options.getString("reason") ?? "AFK";
        await db.insert(afkUsersTable).values({ userId, guildId, reason })
            .onConflictDoUpdate({ target: [afkUsersTable.userId, afkUsersTable.guildId], set: { reason, setAt: new Date() } });
        const embed = new EmbedBuilder().setColor(0xfee75c).setTitle("💤 AFK Status Set")
            .setDescription(`You are now AFK: **${reason}**\nI'll let people know you're away when they mention you.`)
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "remove") {
        const [existing] = await db.select().from(afkUsersTable).where(and(eq(afkUsersTable.userId, userId), eq(afkUsersTable.guildId, guildId)));
        if (!existing)
            return interaction.reply({ content: "You don't have an active AFK status.", flags: 64 });
        await db.delete(afkUsersTable).where(and(eq(afkUsersTable.userId, userId), eq(afkUsersTable.guildId, guildId)));
        return interaction.reply({ content: "✅ Your AFK status has been removed.", flags: 64 });
    }
}
