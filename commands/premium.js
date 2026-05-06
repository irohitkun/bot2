import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
  import { db, premiumGuildsTable } from "../db/index.js";
  import { eq } from "drizzle-orm";
  import { invalidatePremiumCache, TIER_FEATURES } from "../utils/permissions.js";

  const VOTE_URL = "https://top.gg/bot/";
  const VOTE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

  export const data = new SlashCommandBuilder()
      .setName("premium")
      .setDescription("Manage and check premium status for this server")
      .addSubcommand((sub) =>
          sub.setName("vote")
              .setDescription("Vote on top.gg to unlock Premium for 12 hours (server owner only)"))
      .addSubcommand((sub) =>
          sub.setName("status")
              .setDescription("Check the premium status of this server"))
      .addSubcommand((sub) =>
          sub.setName("info")
              .setDescription("See what Premium includes and how to get it"));

  export async function execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "info")   return handleInfo(interaction);
      if (sub === "status") return handleStatus(interaction);
      if (sub === "vote")   return handleVote(interaction);
  }

  async function handleVote(interaction) {
      if (interaction.guild.ownerId !== interaction.user.id) {
          return interaction.reply({
              content: "❌ Only the server owner can activate premium via vote.",
              flags: 64,
          });
      }

      const botId = interaction.client.user.id;
      const voteLink = `${VOTE_URL}${botId}/vote`;
      const token = process.env.TOPGG_TOKEN;

      if (!token) {
          return interaction.reply({
              content: `⚠️ Top.gg integration isn't configured yet. Please vote at: ${voteLink}\n\nThen ask the bot owner to set up the top.gg token.`,
              flags: 64,
          });
      }

      await interaction.deferReply({ flags: 64 });

      // Check if user voted on top.gg
      let voted = false;
      try {
          const res = await fetch(`https://top.gg/api/bots/${botId}/check?userId=${interaction.user.id}`, {
              headers: { Authorization: token },
          });
          const data = await res.json();
          voted = data.voted === 1;
      } catch {
          return interaction.editReply({ content: "❌ Couldn't reach top.gg to verify your vote. Try again in a moment." });
      }

      if (!voted) {
          const embed = new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle("🗳️ Vote to Unlock Premium")
              .setDescription(
                  `Vote for Crux on top.gg to unlock **12 hours of Premium** for this server — free, no strings attached.\n\n` +
                  `After voting, come back and run \`/premium vote\` again to activate it.`
              )
              .addFields({ name: "🔗 Vote Link", value: `[${voteLink}](${voteLink})` })
              .setFooter({ text: "Premium renews automatically every time you vote." })
              .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
      }

      // Activate 12h premium for this guild
      const guildId = interaction.guild.id;
      const expiresAt = new Date(Date.now() + VOTE_DURATION_MS);

      await db.insert(premiumGuildsTable).values({
          guildId,
          activatedBy: interaction.user.id,
          activatedByTag: interaction.user.tag,
          expiresAt,
          tier: "premium",
          isTrial: false,
          reminderSent: false,
          notes: `Vote-based premium activated by ${interaction.user.tag}`,
      }).onConflictDoUpdate({
          target: premiumGuildsTable.guildId,
          set: {
              activatedBy: interaction.user.id,
              activatedByTag: interaction.user.tag,
              activatedAt: new Date(),
              expiresAt,
              tier: "premium",
              isTrial: false,
              reminderSent: false,
              notes: `Vote-based premium activated by ${interaction.user.tag}`,
          },
      });

      invalidatePremiumCache(guildId);

      const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("⭐ Premium Activated!")
          .setDescription(
              `Thanks for voting! This server now has **Premium for 12 hours**.` +
              `\n\nVote again anytime to keep it going — premium renews each time.`
          )
          .addFields(
              { name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
              { name: "Vote again at", value: `[${voteLink}](${voteLink})`, inline: true },
          )
          .setFooter({ text: "Premium renews automatically every time you vote." })
          .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
  }

  async function handleInfo(interaction) {
      const botId = interaction.client.user.id;
      const voteLink = `${VOTE_URL}${botId}/vote`;

      const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("⭐ Premium — One Plan, All Features")
          .setDescription(
              `Unlock every advanced feature for free by voting for Crux on top.gg.\n` +
              `**One vote = 12 hours of Premium.** Vote again to keep it active.`
          )
          .addFields(
              { name: "🔓 Free — Always Free", value: TIER_FEATURES.free.map((f) => `• ${f}`).join("\n") },
              { name: "⭐ Premium — Unlocked by Voting", value: TIER_FEATURES.premium.map((f) => `• ${f}`).join("\n") },
              { name: "🗳️ How to get Premium", value: `Vote at [${voteLink}](${voteLink})\nThen run \`/premium vote\` to activate it instantly.\nRenews automatically every time you vote!` },
          )
          .setFooter({ text: "Use /premium status to check if your server has Premium • /freetrial for a 30-day trial" })
          .setTimestamp();
      return interaction.reply({ embeds: [embed] });
  }

  async function handleStatus(interaction) {
      const guildId = interaction.guild?.id;
      if (!guildId) return interaction.reply({ content: "❌ Use this command in a server.", flags: 64 });

      const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
      if (!row) {
          const botId = interaction.client.user.id;
          const voteLink = `${VOTE_URL}${botId}/vote`;
          const embed = new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle("🔓 Free Tier")
              .setDescription(
                  `This server is on the **free tier**.\n\nVote for Crux at [${voteLink}](${voteLink}) and run \`/premium vote\` to unlock Premium for 12 hours!`
              )
              .addFields({ name: "Free Features", value: TIER_FEATURES.free.map((f) => `• ${f}`).join("\n") })
              .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
      }

      const expired = row.expiresAt && row.expiresAt.getTime() <= Date.now();
      const displayTier = expired ? "free" : "premium";

      const embed = new EmbedBuilder()
          .setColor(expired ? 0x95a5a6 : 0xf1c40f)
          .setTitle(`${displayTier === "premium" ? "⭐" : "🔓"} Premium Status${row.isTrial ? " (Free Trial)" : ""}`)
          .addFields(
              { name: "Status", value: expired ? "❌ Expired" : "✅ Active", inline: true },
              { name: "Expires", value: row.expiresAt ? `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>` : "Never", inline: true },
          )
          .setTimestamp();

      if (!expired) {
          const features = TIER_FEATURES.premium;
          embed.addFields({ name: "What's included", value: features.map((f) => `• ${f}`).join("\n") });
      }

      return interaction.reply({ embeds: [embed], flags: 64 });
  }
  