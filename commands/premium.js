import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { isBotOwner, invalidatePremiumCache } from "../utils/permissions.js";
function parsePremiumDuration(input) {
    if (!input)
        return null;
    const value = input.trim().toLowerCase();
    if (["permanent", "perm", "lifetime", "forever"].includes(value))
        return null;
    const match = value.match(/^(\d+)\s*(m|mo|month|months|d|day|days|w|week|weeks|y|yr|year|years)$/);
    if (!match)
        throw new Error("Invalid duration. Use examples like `7d`, `2w`, `1m`, `3months`, `1y`, or `permanent`.");
    const amount = Number(match[1]);
    const unit = match[2];
    const expiresAt = new Date();
    if (["d", "day", "days"].includes(unit))
        expiresAt.setDate(expiresAt.getDate() + amount);
    else if (["w", "week", "weeks"].includes(unit))
        expiresAt.setDate(expiresAt.getDate() + amount * 7);
    else if (["m", "mo", "month", "months"].includes(unit))
        expiresAt.setMonth(expiresAt.getMonth() + amount);
    else if (["y", "yr", "year", "years"].includes(unit))
        expiresAt.setFullYear(expiresAt.getFullYear() + amount);
    return expiresAt;
}
export const data = new SlashCommandBuilder()
    .setName("premium")
    .setDescription("Manage premium status for servers (Bot owners only)")
    .addSubcommand((sub) => sub.setName("activate").setDescription("Activate premium for a server")
    .addStringOption((opt) => opt.setName("guild_id").setDescription("Guild ID").setRequired(true))
    .addStringOption((opt) => opt.setName("duration").setDescription("Premium duration, e.g. 7d, 2w, 1m, 1y, or permanent").setRequired(false))
    .addStringOption((opt) => opt.setName("tier").setDescription("Tier: basic, pro, enterprise").setRequired(false))
    .addStringOption((opt) => opt.setName("notes").setDescription("Internal notes").setRequired(false)))
    .addSubcommand((sub) => sub.setName("deactivate").setDescription("Deactivate premium for a server")
    .addStringOption((opt) => opt.setName("guild_id").setDescription("Guild ID").setRequired(true)))
    .addSubcommand((sub) => sub.setName("status").setDescription("Check premium status")
    .addStringOption((opt) => opt.setName("guild_id").setDescription("Guild ID (defaults to current)").setRequired(false)))
    .addSubcommand((sub) => sub.setName("list").setDescription("List all premium servers"));
export async function execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
        return interaction.reply({ content: "❌ This command is restricted to bot owners only.", flags: 64 });
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "activate") {
        const guildId = interaction.options.getString("guild_id", true).trim();
        const duration = interaction.options.getString("duration");
        const tier = interaction.options.getString("tier") ?? "basic";
        const notes = interaction.options.getString("notes");
        let expiresAt;
        try {
            expiresAt = parsePremiumDuration(duration);
        }
        catch (err) {
            return interaction.reply({ content: `❌ ${err.message}`, flags: 64 });
        }
        await db.insert(premiumGuildsTable).values({
            guildId, activatedBy: interaction.user.id, activatedByTag: interaction.user.tag, tier, expiresAt, notes: notes ?? undefined,
        }).onConflictDoUpdate({
            target: premiumGuildsTable.guildId,
            set: { activatedBy: interaction.user.id, activatedByTag: interaction.user.tag, activatedAt: new Date(), tier, expiresAt, notes: notes ?? undefined },
        });
        invalidatePremiumCache(guildId);
        const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("⭐ Premium Activated")
            .addFields({ name: "Guild ID", value: guildId, inline: true }, { name: "Tier", value: tier, inline: true }, { name: "Expires", value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : "Never", inline: true }, { name: "By", value: interaction.user.tag, inline: true })
            .setTimestamp();
        if (notes)
            embed.addFields({ name: "Notes", value: notes });
        return interaction.reply({ embeds: [embed], flags: 64 });
    }
    if (sub === "deactivate") {
        const guildId = interaction.options.getString("guild_id", true).trim();
        const [existing] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
        if (!existing)
            return interaction.reply({ content: "That guild does not have premium.", flags: 64 });
        await db.delete(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
        invalidatePremiumCache(guildId);
        return interaction.reply({ content: `✅ Premium deactivated for guild \`${guildId}\`.`, flags: 64 });
    }
    if (sub === "status") {
        const guildId = interaction.options.getString("guild_id") ?? interaction.guild.id;
        const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
        if (!row)
            return interaction.reply({ content: `❌ Guild \`${guildId}\` does not have premium.`, flags: 64 });
        const expired = row.expiresAt && row.expiresAt.getTime() <= Date.now();
        const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("⭐ Premium Status")
            .addFields({ name: "Guild ID", value: row.guildId, inline: true }, { name: "Tier", value: row.tier, inline: true }, { name: "Status", value: expired ? "Expired" : "Active", inline: true }, { name: "Expires", value: row.expiresAt ? `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>` : "Never", inline: true }, { name: "Activated By", value: row.activatedByTag, inline: true }, { name: "Since", value: `<t:${Math.floor(row.activatedAt.getTime() / 1000)}:R>`, inline: true }).setTimestamp();
        if (row.notes)
            embed.addFields({ name: "Notes", value: row.notes });
        return interaction.reply({ embeds: [embed], flags: 64 });
    }
    if (sub === "list") {
        const rows = await db.select().from(premiumGuildsTable);
        if (rows.length === 0)
            return interaction.reply({ content: "No premium guilds found.", flags: 64 });
        const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`⭐ Premium Guilds (${rows.length})`)
            .setDescription(rows.map((r) => {
            const expired = r.expiresAt && r.expiresAt.getTime() <= Date.now();
            const expiry = r.expiresAt ? `<t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>` : "Never";
            return `\`${r.guildId}\` — **${r.tier}** — ${expired ? "Expired" : "Active"} — Expires: ${expiry} — ${r.notes ?? "No notes"}`;
        }).join("\n"))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }
}
