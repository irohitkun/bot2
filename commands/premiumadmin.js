import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
  import { db, premiumGuildsTable } from "../db/index.js";
  import { eq } from "drizzle-orm";
  import { isBotOwner, normalizeTier, invalidatePremiumCache } from "../utils/permissions.js";

  const TIER_ICONS = { free: "🔓", premium: "⭐" };

  async function getGuildDisplayName(client, guildId) {
      const cached = client.guilds.cache.get(guildId);
      if (cached) return cached.name;
      const fetched = await client.guilds.fetch(guildId).catch(() => null);
      return fetched?.name ?? "Unknown server";
  }

  export const data = new SlashCommandBuilder()
      .setName("premiumadmin")
      .setDescription("Bot owner: manage premium subscriptions")
      .setDefaultMemberPermissions(0)
      .addSubcommand((sub) =>
          sub.setName("list")
              .setDescription("View all active and expired premium subscriptions"))
      .addSubcommand((sub) =>
          sub.setName("activate")
              .setDescription("Grant premium to a server (paid or manual activation)")
              .addStringOption((o) =>
                  o.setName("guild_id").setDescription("The server's guild ID").setRequired(true))
              .addBooleanOption((o) =>
                  o.setName("permanent").setDescription("Never expires (paid customers). Default: false").setRequired(false))
              .addIntegerOption((o) =>
                  o.setName("days").setDescription("How many days of premium (ignored if permanent). Default: 30").setRequired(false))
              .addStringOption((o) =>
                  o.setName("notes").setDescription("Optional note, e.g. 'Paid via UPI — txn #12345'").setRequired(false)))
      .addSubcommand((sub) =>
          sub.setName("revoke")
              .setDescription("Remove premium from a server immediately")
              .addStringOption((o) =>
                  o.setName("guild_id").setDescription("The server's guild ID").setRequired(true))
              .addStringOption((o) =>
                  o.setName("reason").setDescription("Optional reason for revoking").setRequired(false)));

  export async function execute(interaction) {
      if (!isBotOwner(interaction.user.id)) {
          return interaction.reply({ content: "❌ This command is restricted to bot owners only.", flags: 64 });
      }

      const sub = interaction.options.getSubcommand();
      if (sub === "list")     return handleList(interaction);
      if (sub === "activate") return handleActivate(interaction);
      if (sub === "revoke")   return handleRevoke(interaction);
  }

  // ─── LIST ────────────────────────────────────────────────────────────────────

  async function handleList(interaction) {
      await interaction.deferReply({ flags: 64 });

      const rows = await db.select().from(premiumGuildsTable);

      if (rows.length === 0) {
          return interaction.editReply({ content: "No premium subscriptions found." });
      }

      const now = Date.now();
      const active  = rows.filter((r) => !r.expiresAt || r.expiresAt.getTime() > now);
      const expired = rows.filter((r) =>  r.expiresAt && r.expiresAt.getTime() <= now);

      const activeEmbed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle(`📊 Premium Overview — ${active.length} Active, ${expired.length} Expired`)
          .setTimestamp();

      if (active.length > 0) {
          const lines = await Promise.all(active.map(async (r) => {
              const tier  = normalizeTier(r.tier);
              const icon  = TIER_ICONS[tier] ?? "⭐";
              const trial = r.isTrial ? " 🆕 trial" : r.expiresAt ? "" : " 🔒 permanent";
              const expiry = r.expiresAt
                  ? `Expires <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>`
                  : "**Never expires**";
              const activated = `<t:${Math.floor(r.activatedAt.getTime() / 1000)}:D>`;
              const notify = r.notifyUserId ? ` • Notify: <@${r.notifyUserId}>` : "";
              const guildName = await getGuildDisplayName(interaction.client, r.guildId);
              return [
                  `**Guild:** ${guildName} (\`${r.guildId}\`)`,
                  `${icon} **${tier}${trial}** • Activated: ${activated} • ${expiry}${notify}`,
                  `By: ${r.activatedByTag}`,
                  `Notes: ${r.notes || "None"}`,
              ].join("\n");
          }));

          const chunks = [];
          let current = "";
          for (const line of lines) {
              if ((current + "\n\n" + line).length > 3800) { chunks.push(current); current = line; }
              else current = current ? current + "\n\n" + line : line;
          }
          if (current) chunks.push(current);

          activeEmbed.setDescription(chunks[0]);
          await interaction.editReply({ embeds: [activeEmbed] });
          for (let i = 1; i < chunks.length; i++) {
              await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(chunks[i])], flags: 64 });
          }
      } else {
          activeEmbed.setDescription("No active subscriptions.");
          await interaction.editReply({ embeds: [activeEmbed] });
      }

      if (expired.length > 0) {
          const expiredLines = (await Promise.all(expired.map(async (r) => {
              const tier  = normalizeTier(r.tier);
              const icon  = TIER_ICONS[tier] ?? "⭐";
              const trial = r.isTrial ? " 🆕" : "";
              const guildName = await getGuildDisplayName(interaction.client, r.guildId);
              const note = r.notes ? ` — ${r.notes}` : "";
              return `**${guildName}** (\`${r.guildId}\`) — ${icon} **${tier}${trial}** — Expired <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R> — by ${r.activatedByTag}${note}`;
          }))).join("\n");

          await interaction.followUp({
              embeds: [
                  new EmbedBuilder()
                      .setColor(0xe74c3c)
                      .setTitle(`🔴 Expired Subscriptions (${expired.length})`)
                      .setDescription(expiredLines.slice(0, 4000))
                      .setTimestamp(),
              ],
              flags: 64,
          });
      }
  }

  // ─── ACTIVATE ────────────────────────────────────────────────────────────────

  async function handleActivate(interaction) {
      await interaction.deferReply({ flags: 64 });

      const guildId   = interaction.options.getString("guild_id").trim();
      const permanent = interaction.options.getBoolean("permanent") ?? false;
      const days      = interaction.options.getInteger("days") ?? 30;
      const notes     = interaction.options.getString("notes") ?? "Manual activation by bot owner";

      const expiresAt = permanent ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      await db.insert(premiumGuildsTable).values({
          guildId,
          activatedBy: interaction.user.id,
          activatedByTag: interaction.user.tag,
          tier: "premium",
          expiresAt,
          isTrial: false,
          reminderSent: false,
          notifyUserId: null,
          notes,
      }).onConflictDoUpdate({
          target: premiumGuildsTable.guildId,
          set: {
              activatedBy: interaction.user.id,
              activatedByTag: interaction.user.tag,
              activatedAt: new Date(),
              tier: "premium",
              expiresAt,
              isTrial: false,
              reminderSent: false,
              notes,
          },
      });

      invalidatePremiumCache(guildId);

      const guildName = await getGuildDisplayName(interaction.client, guildId);

      const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("⭐ Premium Activated")
          .addFields(
              { name: "Server",   value: `${guildName} (\`${guildId}\`)`, inline: false },
              { name: "Type",     value: permanent ? "🔒 Permanent (no expiry)" : `⏳ ${days} days`, inline: true },
              { name: "Expires",  value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : "Never", inline: true },
              { name: "Notes",    value: notes, inline: false },
          )
          .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
  }

  // ─── REVOKE ──────────────────────────────────────────────────────────────────

  async function handleRevoke(interaction) {
      await interaction.deferReply({ flags: 64 });

      const guildId = interaction.options.getString("guild_id").trim();
      const reason  = interaction.options.getString("reason") ?? "Revoked by bot owner";

      const [existing] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));

      if (!existing) {
          return interaction.editReply({ content: `❌ No premium record found for guild \`${guildId}\`.` });
      }

      // Set expiry to right now — effectively kills it immediately
      await db
          .update(premiumGuildsTable)
          .set({ expiresAt: new Date(), notes: `[REVOKED] ${reason}` })
          .where(eq(premiumGuildsTable.guildId, guildId));

      invalidatePremiumCache(guildId);

      const guildName = await getGuildDisplayName(interaction.client, guildId);

      const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🔴 Premium Revoked")
          .addFields(
              { name: "Server", value: `${guildName} (\`${guildId}\`)`, inline: false },
              { name: "Reason", value: reason, inline: false },
          )
          .setFooter({ text: "The server has been downgraded to free tier immediately." })
          .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
  }
  