import {
      SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
      ButtonBuilder, ButtonStyle, PermissionFlagsBits,
  } from "discord.js";
  import { db } from "../db/index.js";
  import { verificationSettingsTable } from "../db/index.js";
  import { eq } from "drizzle-orm";
  import { getGuildStyle } from "../utils/guildStyle.js";

  export const data = new SlashCommandBuilder()
      .setName("verification")
      .setDescription("Set up a button-based verification gate for new members")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(sub => sub.setName("setup")
          .setDescription("Configure the verification system")
          .addChannelOption(o => o.setName("channel").setDescription("Channel to post the verify button in").setRequired(true))
          .addRoleOption(o => o.setName("role").setDescription("Role to grant upon verification").setRequired(true))
          .addStringOption(o => o.setName("message").setDescription("Custom message shown on the verify embed").setRequired(false).setMaxLength(500)))
      .addSubcommand(sub => sub.setName("panel")
          .setDescription("Post or re-post the verification panel in the configured channel"))
      .addSubcommand(sub => sub.setName("disable")
          .setDescription("Disable the verification system"))
      .addSubcommand(sub => sub.setName("status")
          .setDescription("View current verification settings"));

  export async function execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const { color } = await getGuildStyle(guildId);

      if (sub === "setup") {
          const channel = interaction.options.getChannel("channel");
          const role = interaction.options.getRole("role");
          const message = interaction.options.getString("message") ?? "Click the button below to verify yourself and gain access to the server.";

          await db.insert(verificationSettingsTable).values({
              guildId,
              channelId: channel.id,
              roleId: role.id,
              message,
              enabled: true,
          }).onConflictDoUpdate({ target: verificationSettingsTable.guildId, set: { channelId: channel.id, roleId: role.id, message, enabled: true, updatedAt: new Date() } });

          await interaction.reply({ content: `✅ Verification configured! Channel: ${channel} | Role: ${role}\n\nRun `/verification panel` to post the verify button.`, flags: 64 });
      }

      else if (sub === "panel") {
          const [settings] = await db.select().from(verificationSettingsTable).where(eq(verificationSettingsTable.guildId, guildId));
          if (!settings?.enabled || !settings.channelId || !settings.roleId) {
              return interaction.reply({ content: "❌ Verification is not set up. Run `/verification setup` first.", flags: 64 });
          }
          const channel = interaction.guild.channels.cache.get(settings.channelId);
          if (!channel) return interaction.reply({ content: "❌ The configured channel no longer exists. Re-run `/verification setup`.", flags: 64 });

          const embed = new EmbedBuilder()
              .setColor(color)
              .setTitle("✅ Server Verification")
              .setDescription(settings.message)
              .setFooter({ text: "Click the button below to verify and gain access." })
              .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                  .setCustomId("verify:click")
                  .setLabel("Verify Me")
                  .setEmoji("✅")
                  .setStyle(ButtonStyle.Success),
          );

          await channel.send({ embeds: [embed], components: [row] });
          await interaction.reply({ content: `✅ Verification panel posted in ${channel}.`, flags: 64 });
      }

      else if (sub === "disable") {
          await db.insert(verificationSettingsTable).values({ guildId, enabled: false }).onConflictDoUpdate({
              target: verificationSettingsTable.guildId,
              set: { enabled: false, updatedAt: new Date() },
          });
          await interaction.reply({ content: "✅ Verification disabled.", flags: 64 });
      }

      else if (sub === "status") {
          const [settings] = await db.select().from(verificationSettingsTable).where(eq(verificationSettingsTable.guildId, guildId));
          const embed = new EmbedBuilder()
              .setColor(color)
              .setTitle("✅ Verification Settings")
              .addFields(
                  { name: "Status", value: settings?.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
                  { name: "Channel", value: settings?.channelId ? `<#${settings.channelId}>` : "Not set", inline: true },
                  { name: "Role", value: settings?.roleId ? `<@&${settings.roleId}>` : "Not set", inline: true },
                  { name: "Message", value: settings?.message ?? "Default message" },
              )
              .setTimestamp();
          await interaction.reply({ embeds: [embed], flags: 64 });
      }
  }
  