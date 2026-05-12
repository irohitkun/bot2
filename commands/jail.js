import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
  import { db, jailSettingsTable, jailRecordsTable } from "../db/index.js";
  import { eq, and } from "drizzle-orm";
  import { getGuildStyle } from "../utils/guildStyle.js";
  import { sendModLog } from "../utils/modLog.js";

  export const data = new SlashCommandBuilder()
      .setName("jail")
      .setDescription("Jail or unjail a member — smart toggle. Use once to jail, again to release.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addSubcommand((sub) =>
          sub.setName("setup")
              .setDescription("Configure the jail role and optional jail channel")
              .addRoleOption((o) => o.setName("role").setDescription("Role applied when jailing (all other roles are removed)").setRequired(true))
              .addChannelOption((o) => o.setName("channel").setDescription("Channel jailed members can see and talk in").setRequired(false)))
      .addSubcommand((sub) =>
          sub.setName("member")
              .setDescription("Jail or unjail a member — runs again to release automatically")
              .addUserOption((o) => o.setName("user").setDescription("Member to jail or unjail").setRequired(true))
              .addStringOption((o) => o.setName("reason").setDescription("Reason (shown in DM and mod-log)").setRequired(false)));

  export async function execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "setup") return handleSetup(interaction);
      if (sub === "member") return handleToggle(interaction);
  }

  async function handleSetup(interaction) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "❌ You need Manage Server permission to configure jail.", flags: 64 });
      }

      const role = interaction.options.getRole("role", true);
      const channel = interaction.options.getChannel("channel");
      const guild = interaction.guild;

      await db.insert(jailSettingsTable).values({
          guildId: guild.id,
          jailRoleId: role.id,
          jailChannelId: channel?.id ?? null,
      }).onConflictDoUpdate({
          target: jailSettingsTable.guildId,
          set: { jailRoleId: role.id, jailChannelId: channel?.id ?? null, updatedAt: new Date() },
      });

      const { color } = await getGuildStyle(guild.id);
      return interaction.reply({
          embeds: [new EmbedBuilder()
              .setColor(color)
              .setTitle("⚙️ Jail Configured")
              .setDescription("Jail is ready. Use `/jail member @user` to jail or unjail anyone.")
              .addFields(
                  { name: "Jail Role", value: `<@&${role.id}>`, inline: true },
                  { name: "Jail Channel", value: channel ? `<#${channel.id}>` : "None set", inline: true },
              )
              .setTimestamp()],
      });
  }

  async function handleToggle(interaction) {
      const target = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const guild = interaction.guild;

      const [settings] = await db.select().from(jailSettingsTable).where(eq(jailSettingsTable.guildId, guild.id));
      if (!settings?.jailRoleId) {
          return interaction.reply({ content: "❌ Jail is not set up yet. Run `/jail setup` first.", flags: 64 });
      }

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.reply({ content: "❌ Could not find that member in this server.", flags: 64 });
      if (!member.manageable) return interaction.reply({ content: "❌ I can't manage this member — they may have a higher role than me.", flags: 64 });
      if (member.id === interaction.user.id) return interaction.reply({ content: "❌ You cannot jail yourself.", flags: 64 });

      const jailRole = guild.roles.cache.get(settings.jailRoleId);
      if (!jailRole) return interaction.reply({ content: "❌ The configured jail role no longer exists. Run `/jail setup` again.", flags: 64 });

      // ── Check if already jailed ───────────────────────────────────────────────
      const [activeRecord] = await db.select().from(jailRecordsTable)
          .where(and(eq(jailRecordsTable.guildId, guild.id), eq(jailRecordsTable.userId, target.id), eq(jailRecordsTable.active, true)));

      await interaction.deferReply();

      if (activeRecord) {
          // ── UNJAIL ────────────────────────────────────────────────────────────
          await member.roles.remove(settings.jailRoleId, `Released by ${interaction.user.tag}`).catch(() => {});

          const savedRoles = activeRecord.savedRoles ? activeRecord.savedRoles.split(",").filter(Boolean) : [];
          let restored = 0;
          for (const roleId of savedRoles) {
              const role = guild.roles.cache.get(roleId);
              if (role && !role.managed && role.id !== guild.id) {
                  await member.roles.add(roleId, "Jail release — role restored").catch(() => {});
                  restored++;
              }
          }

          await db.update(jailRecordsTable)
              .set({ active: false, releasedAt: new Date(), releasedBy: interaction.user.id })
              .where(eq(jailRecordsTable.id, activeRecord.id));

          const embed = new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle("🔓 Member Released from Jail")
              .addFields(
                  { name: "User", value: `${target.tag} (${target.id})`, inline: true },
                  { name: "Released By", value: interaction.user.tag, inline: true },
                  { name: "Roles Restored", value: `${restored}`, inline: true },
                  { name: "Original Reason", value: activeRecord.reason },
              )
              .setThumbnail(target.displayAvatarURL())
              .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

          try {
              await target.send({ embeds: [new EmbedBuilder()
                  .setColor(0x57f287)
                  .setTitle("🔓 You have been released")
                  .setDescription(`You have been released from jail in **${guild.name}**. Your roles have been restored.`)
                  .setTimestamp()] });
          } catch {}

          await sendModLog(guild, new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle("🔓 Member Released from Jail")
              .addFields(
                  { name: "User", value: `${target.tag} (${target.id})`, inline: true },
                  { name: "Released By", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                  { name: "Roles Restored", value: `${restored}`, inline: true },
              )
              .setTimestamp()
          );

      } else {
          // ── JAIL ──────────────────────────────────────────────────────────────
          const savedRoles = member.roles.cache
              .filter((r) => r.id !== guild.id && r.id !== settings.jailRoleId)
              .map((r) => r.id);

          for (const roleId of savedRoles) {
              await member.roles.remove(roleId, `Jailed by ${interaction.user.tag}: ${reason}`).catch(() => {});
          }
          await member.roles.add(jailRole, `Jailed by ${interaction.user.tag}: ${reason}`).catch(() => {});

          await db.insert(jailRecordsTable).values({
              guildId: guild.id,
              userId: target.id,
              userTag: target.tag,
              moderatorId: interaction.user.id,
              moderatorTag: interaction.user.tag,
              reason,
              savedRoles: savedRoles.join(","),
          });

          const embed = new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle("🔒 Member Jailed")
              .setDescription(settings.jailChannelId
                  ? `Member has been isolated to <#${settings.jailChannelId}>.`
                  : "Member's roles have been removed and the jail role applied.")
              .addFields(
                  { name: "User", value: `${target.tag} (${target.id})`, inline: true },
                  { name: "Moderator", value: interaction.user.tag, inline: true },
                  { name: "Roles Saved", value: `${savedRoles.length}`, inline: true },
                  { name: "Reason", value: reason },
              )
              .setFooter({ text: "Run /jail member @user again to release them" })
              .setThumbnail(target.displayAvatarURL())
              .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

          try {
              await target.send({ embeds: [new EmbedBuilder()
                  .setColor(0xed4245)
                  .setTitle("🔒 You have been jailed")
                  .setDescription(`You have been jailed in **${guild.name}**.

**Reason:** ${reason}

Contact a moderator to be released.`)
                  .setTimestamp()] });
          } catch {}

          await sendModLog(guild, new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle("🔒 Member Jailed")
              .addFields(
                  { name: "User", value: `${target.tag} (${target.id})`, inline: true },
                  { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                  { name: "Roles Saved", value: `${savedRoles.length}`, inline: true },
                  { name: "Reason", value: reason },
              )
              .setTimestamp()
          );
      }
  }
  