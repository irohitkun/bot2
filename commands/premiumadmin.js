import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { isBotOwner, normalizeTier } from "../utils/permissions.js";

const TIER_ICONS  = { free: "🔓", premium: "⭐" };

async function getGuildDisplayName(client, guildId) {
    const cached = client.guilds.cache.get(guildId);
    if (cached)
        return cached.name;
    const fetched = await client.guilds.fetch(guildId).catch(() => null);
    return fetched?.name ?? "Unknown server";
}

export const data = new SlashCommandBuilder()
    .setName("premiumadmin")
    .setDescription("View all active premium subscriptions and their details")
    // Hidden from slash command picker for all non-admin users
    .setDefaultMemberPermissions(0);

export async function execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
        return interaction.reply({ content: "❌ This command is restricted to bot owners only.", flags: 64 });
    }

    await interaction.deferReply();

    const rows = await db.select().from(premiumGuildsTable);

    if (rows.length === 0) {
        return interaction.editReply({ content: "No premium subscriptions found." });
    }

    const now = Date.now();
    const active = rows.filter((r) => !r.expiresAt || r.expiresAt.getTime() > now);
    const expired = rows.filter((r) => r.expiresAt && r.expiresAt.getTime() <= now);

    // Build the active subscriptions embed
    const activeEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`📊 Premium Overview — ${active.length} Active, ${expired.length} Expired`)
        .setTimestamp();

    if (active.length > 0) {
        const lines = await Promise.all(active.map(async (r) => {
            const tier = normalizeTier(r.tier);
            const icon = TIER_ICONS[tier] ?? "⭐";
            const trial = r.isTrial ? " 🆕" : "";
            const expiry = r.expiresAt
                ? `Expires <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>`
                : "Never expires";
            const activated = `<t:${Math.floor(r.activatedAt.getTime() / 1000)}:D>`;
            const notify = r.notifyUserId ? ` • Notify: <@${r.notifyUserId}>` : "";
            const guildName = await getGuildDisplayName(interaction.client, r.guildId);
            return [
                `**Guild:** ${guildName} (\`${r.guildId}\`)`,
                `${icon} **${tier}**${trial} • Activated: ${activated} • ${expiry}${notify}`,
                `Activated by: ${r.activatedByTag}`,
                `Notes: ${r.notes || "None"}`,
            ].join("\n");
        }));

        // Discord embeds cap at 4096 chars — split into chunks if needed
        const chunks = [];
        let current = "";
        for (const line of lines) {
            if ((current + "\n\n" + line).length > 3800) {
                chunks.push(current);
                current = line;
            } else {
                current = current ? current + "\n\n" + line : line;
            }
        }
        if (current) chunks.push(current);

        activeEmbed.setDescription(chunks[0]);

        // Send first embed
        await interaction.editReply({ embeds: [activeEmbed] });

        // Send overflow chunks as follow-ups
        for (let i = 1; i < chunks.length; i++) {
            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ecc71)
                        .setDescription(chunks[i]),
                ],
            });
        }
    } else {
        activeEmbed.setDescription("No active subscriptions.");
        await interaction.editReply({ embeds: [activeEmbed] });
    }

    // Show expired entries too if any
    if (expired.length > 0) {
        const expiredLines = (await Promise.all(expired.map(async (r) => {
            const tier = normalizeTier(r.tier);
            const icon = TIER_ICONS[tier] ?? "⭐";
            const trial = r.isTrial ? " 🆕" : "";
            const guildName = await getGuildDisplayName(interaction.client, r.guildId);
            const note = r.notes ? ` — Notes: ${r.notes}` : "";
            return `**${guildName}** (\`${r.guildId}\`) — ${icon} **${tier}**${trial} — Expired <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R> — by ${r.activatedByTag}${note}`;
        }))).join("\n");

        await interaction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle(`🔴 Expired Subscriptions (${expired.length})`)
                    .setDescription(expiredLines.slice(0, 4000))
                    .setTimestamp(),
            ],
        });
    }
}
