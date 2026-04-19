import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { isBotOwner, invalidatePremiumCache, TIER_FEATURES } from "../utils/permissions.js";

const TRIAL_DAYS = 7;
const TRIAL_TIER = "basic";

export const data = new SlashCommandBuilder()
    .setName("freetrial")
    .setDescription("Grant a free 7-day Basic premium trial to a server (Bot owner only)")
    // Hide from the slash command picker for all users
    .setDefaultMemberPermissions(0)
    .addStringOption((opt) =>
        opt.setName("guild_id")
            .setDescription("The server ID to grant the free trial to")
            .setRequired(true))
    .addStringOption((opt) =>
        opt.setName("notify_user_id")
            .setDescription("User ID to DM when the trial is about to expire (defaults to guild owner)")
            .setRequired(false));

export async function execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
        return interaction.reply({ content: "❌ This command is restricted to bot owners only.", flags: 64 });
    }

    await interaction.deferReply();

    const guildId = interaction.options.getString("guild_id", true).trim();
    const notifyUserId = interaction.options.getString("notify_user_id")?.trim() ?? null;

    // Check if this server already has or had a premium/trial
    const [existing] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));

    if (existing) {
        const expired = existing.expiresAt && existing.expiresAt.getTime() <= Date.now();

        if (!expired) {
            return interaction.editReply({
                content: `❌ Guild \`${guildId}\` already has an active **${existing.isTrial ? "free trial" : "premium"}** (${existing.tier} tier). Expires <t:${Math.floor(existing.expiresAt?.getTime() / 1000 ?? 0)}:R>.`,
            });
        }

        if (existing.isTrial) {
            return interaction.editReply({
                content: `❌ Guild \`${guildId}\` has already used its free trial.`,
            });
        }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS);

    await db.insert(premiumGuildsTable).values({
        guildId,
        activatedBy: interaction.user.id,
        activatedByTag: interaction.user.tag,
        tier: TRIAL_TIER,
        expiresAt,
        isTrial: true,
        reminderSent: false,
        notifyUserId,
        notes: `Free trial granted by ${interaction.user.tag}`,
    }).onConflictDoUpdate({
        target: premiumGuildsTable.guildId,
        set: {
            activatedBy: interaction.user.id,
            activatedByTag: interaction.user.tag,
            activatedAt: new Date(),
            tier: TRIAL_TIER,
            expiresAt,
            isTrial: true,
            reminderSent: false,
            notifyUserId,
            notes: `Free trial granted by ${interaction.user.tag}`,
        },
    });

    invalidatePremiumCache(guildId);

    const features = TIER_FEATURES[TRIAL_TIER] ?? [];

    const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("🎉 Free Trial Granted!")
        .addFields(
            { name: "Guild ID", value: guildId, inline: true },
            { name: "Tier", value: "⭐ Basic", inline: true },
            { name: "Duration", value: `${TRIAL_DAYS} days`, inline: true },
            { name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Granted By", value: interaction.user.tag, inline: true },
            { name: "Notify On Expiry", value: notifyUserId ? `<@${notifyUserId}>` : "Guild owner (auto)", inline: true },
            { name: "What's included", value: features.map((f) => `• ${f}`).join("\n") },
        )
        .setFooter({ text: "Each server gets one free trial only." })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}
