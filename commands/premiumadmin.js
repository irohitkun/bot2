import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { isBotOwner } from "../utils/permissions.js";

const TIER_ICONS  = { free: "🔓", basic: "⭐", pro: "💎", enterprise: "👑" };
const TIER_COLORS = { basic: 0xf1c40f, pro: 0x3498db, enterprise: 0x9b59b6 };

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
        const lines = active.map((r) => {
            const icon = TIER_ICONS[r.tier] ?? "⭐";
            const trial = r.isTrial ? " 🆕" : "";
            const expiry = r.expiresAt
                ? `Expires <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>`
                : "Never expires";
            const activated = `<t:${Math.floor(r.activatedAt.getTime() / 1000)}:D>`;
            const notify = r.notifyUserId ? ` • Notify: <@${r.notifyUserId}>` : "";
            return [
                `**Guild:** \`${r.guildId}\``,
                `${icon} **${r.tier}**${trial} • Activated: ${activated} • ${expiry}${notify}`,
                `Activated by: ${r.activatedByTag}${r.notes ? ` • Note: ${r.notes}` : ""}`,
            ].join("\n");
        });

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
        const expiredLines = expired.map((r) => {
            const icon = TIER_ICONS[r.tier] ?? "⭐";
            const trial = r.isTrial ? " 🆕" : "";
            return `\`${r.guildId}\` — ${icon} **${r.tier}**${trial} — Expired <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R> — by ${r.activatedByTag}`;
        }).join("\n");

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
