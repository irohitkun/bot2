import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { invalidatePremiumCache, TIER_FEATURES } from "../utils/permissions.js";

const TRIAL_DAYS = 7;
const TRIAL_TIER = "basic";

export const data = new SlashCommandBuilder()
    .setName("freetrial")
    .setDescription(`Start a free ${TRIAL_DAYS}-day Basic premium trial for this server`)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: "❌ This command can only be used inside a server.", flags: 64 });

    await interaction.deferReply();

    // Check if the server already has or had premium/trial
    const [existing] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guild.id));

    if (existing) {
        const expired = existing.expiresAt && existing.expiresAt.getTime() <= Date.now();

        if (!expired) {
            return interaction.editReply({
                content: `❌ This server already has an active **${existing.isTrial ? "free trial" : "premium"}** subscription (${existing.tier} tier). It expires <t:${Math.floor(existing.expiresAt?.getTime() / 1000 ?? 0)}:R>.`,
            });
        }

        if (existing.isTrial) {
            return interaction.editReply({
                content: "❌ This server has already used its free trial. Contact the bot owner to upgrade to a paid plan.",
            });
        }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS);

    await db.insert(premiumGuildsTable).values({
        guildId: guild.id,
        activatedBy: interaction.user.id,
        activatedByTag: interaction.user.tag,
        tier: TRIAL_TIER,
        expiresAt,
        isTrial: true,
        reminderSent: false,
        notes: `Free trial started by ${interaction.user.tag}`,
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
            notes: `Free trial started by ${interaction.user.tag}`,
        },
    });

    invalidatePremiumCache(guild.id);

    const features = TIER_FEATURES[TRIAL_TIER] ?? [];

    const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("🎉 Free Trial Activated!")
        .setDescription(
            `**${guild.name}** now has **${TRIAL_DAYS} days** of **Basic** premium for free!\n\n` +
            `Use \`/premium status\` anytime to check your trial status.`
        )
        .addFields(
            { name: "Tier", value: "⭐ Basic", inline: true },
            { name: "Duration", value: `${TRIAL_DAYS} days`, inline: true },
            { name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Started By", value: interaction.user.tag, inline: true },
            {
                name: "What's included",
                value: features.map((f) => `• ${f}`).join("\n"),
            },
        )
        .setFooter({ text: "Each server gets one free trial. Upgrade anytime by contacting the bot owner." })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}
