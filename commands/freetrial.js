import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
  import { db, premiumGuildsTable } from "../db/index.js";
  import { eq } from "drizzle-orm";
  import { invalidatePremiumCache, TIER_FEATURES } from "../utils/permissions.js";

  const TRIAL_DAYS = 30;
  const TRIAL_TIER = "premium";

  export const data = new SlashCommandBuilder()
      .setName("freetrial")
      .setDescription("Activate a free 30-day Premium trial for this server (server owner only)");

  export async function execute(interaction) {
      if (!interaction.guild) {
          return interaction.reply({ content: "❌ Use this command in a server.", flags: 64 });
      }

      if (interaction.guild.ownerId !== interaction.user.id) {
          return interaction.reply({
              content: "❌ Only the server owner can activate the free trial.",
              flags: 64,
          });
      }

      await interaction.deferReply({ flags: 64 });

      const guildId = interaction.guild.id;
      const [existing] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));

      if (existing) {
          const expired = existing.expiresAt && existing.expiresAt.getTime() <= Date.now();

          if (!expired) {
              const expiry = existing.expiresAt
                  ? `<t:${Math.floor(existing.expiresAt.getTime() / 1000)}:R>`
                  : "never";
              return interaction.editReply({
                  content: `❌ This server already has an active **${existing.isTrial ? "free trial" : "premium"}** subscription. It expires ${expiry}.`,
              });
          }

          if (existing.isTrial) {
              return interaction.editReply({
                  content: "❌ This server has already used its free trial. Vote on top.gg and run `/premium vote` to get Premium for free!",
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
          notifyUserId: interaction.user.id,
          notes: `Free trial activated by server owner ${interaction.user.tag}`,
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
              notifyUserId: interaction.user.id,
              notes: `Free trial activated by server owner ${interaction.user.tag}`,
          },
      });

      invalidatePremiumCache(guildId);

      const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🎉 30-Day Free Trial Activated!")
          .setDescription(
              `This server now has **full Premium access for 30 days** — completely free!\n\n` +
              `When the trial ends, vote for Crux on top.gg and use \`/premium vote\` to keep Premium active.`
          )
          .addFields(
              { name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
              { name: "Trial", value: "30 days", inline: true },
              { name: "What's included", value: TIER_FEATURES.premium.map((f) => `• ${f}`).join("\n") },
          )
          .setFooter({ text: "Each server gets one free trial only. Vote on top.gg to continue after it ends." })
          .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
  }
  