import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { isBotOwner, invalidatePremiumCache, TIER_FEATURES } from "../utils/permissions.js";

const TIER_ICONS  = { free: "🔓", premium: "⭐", basic: "⭐", pro: "⭐", enterprise: "⭐" };
const TIER_COLORS = { free: 0x95a5a6, premium: 0xf1c40f, basic: 0xf1c40f, pro: 0xf1c40f, enterprise: 0xf1c40f };

async function getGuildDisplayName(client, guildId) {
    const cached = client.guilds.cache.get(guildId);
    if (cached) return cached.name;
    const fetched = await client.guilds.fetch(guildId).catch(() => null);
    return fetched?.name ?? "Unknown server";
}

function parsePremiumDuration(input) {
    if (!input) return null;
    const value = input.trim().toLowerCase();
    if (["permanent", "perm", "lifetime", "forever"].includes(value)) return null;
    const match = value.match(/^(\d+)\s*(m|mo|month|months|d|day|days|w|week|weeks|y|yr|year|years)$/);
    if (!match) throw new Error("Invalid duration. Use examples like `7d`, `2w`, `1m`, `3months`, `1y`, or `permanent`.");
    const amount = Number(match[1]);
    const unit = match[2];
    const expiresAt = new Date();
    if (["d", "day", "days"].includes(unit)) expiresAt.setDate(expiresAt.getDate() + amount);
    else if (["w", "week", "weeks"].includes(unit)) expiresAt.setDate(expiresAt.getDate() + amount * 7);
    else if (["m", "mo", "month", "months"].includes(unit)) expiresAt.setMonth(expiresAt.getMonth() + amount);
    else if (["y", "yr", "year", "years"].includes(unit)) expiresAt.setFullYear(expiresAt.getFullYear() + amount);
    return expiresAt;
}

export const data = new SlashCommandBuilder()
    .setName("premium")
    .setDescription("Manage premium status for servers")
    .addSubcommand((sub) =>
        sub.setName("activate")
            .setDescription("Activate premium for a server (Bot owners only)")
            .addStringOption((opt) => opt.setName("guild_id").setDescription("Guild ID").setRequired(true))
            .addStringOption((opt) => opt.setName("duration").setDescription("e.g. 7d, 2w, 1m, 1y, or permanent").setRequired(false))
            .addStringOption((opt) =>
                opt.setName("notify_user_id")
                    .setDescription("User ID to DM when subscription expires (defaults to guild owner)")
                    .setRequired(false))
            .addStringOption((opt) => opt.setName("notes").setDescription("Internal notes").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("deactivate")
            .setDescription("Deactivate premium for a server (Bot owners only)")
            .addStringOption((opt) => opt.setName("guild_id").setDescription("Guild ID").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("status")
            .setDescription("Check premium status of this server")
            .addStringOption((opt) => opt.setName("guild_id").setDescription("Guild ID (defaults to current server)").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("List all premium servers (Bot owners only)"))
    .addSubcommand((sub) =>
        sub.setName("info")
            .setDescription("View what Premium includes and how to get it"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "info") return handleInfo(interaction);
    if (sub === "status") return handleStatus(interaction);

    if (!isBotOwner(interaction.user.id)) {
        return interaction.reply({ content: "❌ Only bot owners can manage premium activations.", flags: 64 });
    }

    if (sub === "activate") return handleActivate(interaction);
    if (sub === "deactivate") return handleDeactivate(interaction);
    if (sub === "list") return handleList(interaction);
}

async function handleInfo(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⭐ Premium — One Plan, All Features")
        .setDescription(
            "Upgrade your server to **Premium** and unlock every advanced feature the bot offers.\n" +
            "Contact the bot owner to activate Premium for your server."
        )
        .addFields(
            {
                name: "🔓 Free — Always Free",
                value: TIER_FEATURES.free.map((f) => `• ${f}`).join("\n"),
            },
            {
                name: "⭐ Premium — All Features Unlocked",
                value: TIER_FEATURES.premium.map((f) => `• ${f}`).join("\n"),
            },
        )
        .setFooter({ text: "Use /premium status to check if your server has Premium" })
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

async function handleStatus(interaction) {
    const guildId = interaction.options.getString("guild_id") ?? interaction.guild?.id;
    if (!guildId) return interaction.reply({ content: "❌ Provide a guild ID or use this in a server.", flags: 64 });

    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    if (!row) {
        const embed = new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("🔓 Free Tier")
            .setDescription("This server is on the **free tier**.\n\nUse `/premium info` to see what Premium unlocks.")
            .addFields({ name: "Free Features", value: TIER_FEATURES.free.map((f) => `• ${f}`).join("\n") })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    const expired = row.expiresAt && row.expiresAt.getTime() <= Date.now();
    const displayTier = expired ? "free" : "premium";

    const embed = new EmbedBuilder()
        .setColor(expired ? 0x95a5a6 : 0xf1c40f)
        .setTitle(`${TIER_ICONS[displayTier]} Premium Status${row.isTrial ? " (Free Trial)" : ""}`)
        .addFields(
            { name: "Status", value: expired ? "❌ Expired" : "✅ Active", inline: true },
            { name: "Expires", value: row.expiresAt ? `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>` : "Never", inline: true },
            { name: "Activated By", value: row.activatedByTag, inline: true },
            { name: "Since", value: `<t:${Math.floor(row.activatedAt.getTime() / 1000)}:R>`, inline: true },
        )
        .setTimestamp();

    if (row.notes) embed.addFields({ name: "Notes", value: row.notes });

    const features = TIER_FEATURES[expired ? "free" : "premium"];
    if (features) embed.addFields({ name: "What's included", value: features.map((f) => `• ${f}`).join("\n") });

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleActivate(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guildId = interaction.options.getString("guild_id", true).trim();
    const durationStr = interaction.options.getString("duration");
    const notifyUserId = interaction.options.getString("notify_user_id")?.trim() ?? null;
    const notes = interaction.options.getString("notes") ?? null;

    let expiresAt;
    try {
        expiresAt = parsePremiumDuration(durationStr);
    } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
    }

    await db.insert(premiumGuildsTable)
        .values({
            guildId,
            activatedBy: interaction.user.id,
            activatedByTag: interaction.user.tag,
            expiresAt,
            tier: "premium",
            notes,
            notifyUserId,
            isTrial: false,
        })
        .onConflictDoUpdate({
            target: premiumGuildsTable.guildId,
            set: {
                activatedBy: interaction.user.id,
                activatedByTag: interaction.user.tag,
                activatedAt: new Date(),
                expiresAt,
                tier: "premium",
                notes,
                notifyUserId,
                isTrial: false,
                reminderSent: false,
            },
        });

    invalidatePremiumCache(guildId);

    const guildName = await getGuildDisplayName(interaction.client, guildId);
    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⭐ Premium Activated")
        .addFields(
            { name: "Server", value: `${guildName} (\`${guildId}\`)`, inline: false },
            { name: "Expires", value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : "Never (permanent)", inline: true },
            { name: "By", value: interaction.user.tag, inline: true },
        )
        .setTimestamp();
    if (notes) embed.addFields({ name: "Notes", value: notes });
    return interaction.editReply({ embeds: [embed] });
}

async function handleDeactivate(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guildId = interaction.options.getString("guild_id", true).trim();
    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    if (!row) return interaction.editReply({ content: "❌ That server doesn't have an active premium subscription." });

    await db.delete(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    invalidatePremiumCache(guildId);

    const guildName = await getGuildDisplayName(interaction.client, guildId);
    return interaction.editReply({ content: `✅ Premium deactivated for **${guildName}** (\`${guildId}\`).` });
}

async function handleList(interaction) {
    const rows = await db.select().from(premiumGuildsTable);
    if (rows.length === 0) return interaction.reply({ content: "No premium guilds found.", flags: 64 });

    const lines = await Promise.all(rows.map(async (r) => {
        const expired = r.expiresAt && r.expiresAt.getTime() <= Date.now();
        const expiry = r.expiresAt ? `<t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>` : "Never";
        const trial = r.isTrial ? " 🆕 Trial" : "";
        const guildName = await getGuildDisplayName(interaction.client, r.guildId);
        const note = r.notes ? `\nNotes: ${r.notes}` : "";
        return `**${guildName}** (\`${r.guildId}\`) — ⭐ **Premium**${trial} — ${expired ? "❌ Expired" : "✅ Active"} — Expires: ${expiry}${note}`;
    }));

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`⭐ Premium Guilds (${rows.length})`)
        .setDescription(lines.join("\n\n").slice(0, 4000))
        .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
}
