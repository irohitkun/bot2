import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { isPremiumGuild, TIER_FEATURES } from "../utils/permissions.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
    .setName("perks")
    .setDescription("View this server's current plan and all enabled features");

export async function execute(interaction) {
    await interaction.deferReply();
    const guildId = interaction.guild.id;
    const { color } = await getGuildStyle(guildId);

    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    const hasPremium = !!row && (!row.expiresAt || row.expiresAt.getTime() > Date.now());

    if (hasPremium) {
        const expiry = row.expiresAt
            ? `Expires <t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`
            : "Never expires";
        const isTrial = row.isTrial;

        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`⭐ ${interaction.guild.name} — Premium${isTrial ? " (Free Trial)" : ""}`)
            .setDescription(`This server has **Premium** unlocked. All features below are active.\n📅 ${expiry}`)
            .addFields(
                {
                    name: "🔓 Free Features",
                    value: TIER_FEATURES.free.map((f) => `✅ ${f}`).join("\n"),
                    inline: false,
                },
                {
                    name: "⭐ Premium Features",
                    value: TIER_FEATURES.premium.map((f) => `✅ ${f}`).join("\n"),
                    inline: false,
                },
            )
            .setFooter({ text: "All features are active on this server" })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    // Free tier
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🔓 ${interaction.guild.name} — Free Plan`)
        .setDescription(
            "This server is on the **free plan**. The features below are currently active.\n\n" +
            "Upgrade to **Premium** to unlock all the locked features — contact the bot owner or use `/premium info`.",
        )
        .addFields(
            {
                name: "✅ Free Features — Active",
                value: TIER_FEATURES.free.map((f) => `✅ ${f}`).join("\n"),
                inline: false,
            },
            {
                name: "🔒 Premium Features — Locked",
                value: TIER_FEATURES.premium.slice(1).map((f) => `🔒 ${f}`).join("\n"),
                inline: false,
            },
        )
        .setFooter({ text: "Use /premium info to see how to upgrade" })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}
