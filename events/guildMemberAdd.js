import { Events, EmbedBuilder } from "discord.js";
  import { db, serverCustomizationTable } from "../db/index.js";
  import { eq } from "drizzle-orm";
  import { getGuildStyle } from "../utils/guildStyle.js";
  import { sendModLog } from "../utils/modLog.js";
  import { getTemplate, buildEmbedFromTemplate, varsFromMember, applyVars } from "../utils/embedTemplates.js";

  export const name = Events.GuildMemberAdd;
  export const once = false;

  export async function execute(member) {
      try {
          const guildId = member.guild.id;
          const [config] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guildId));
          const style = await getGuildStyle(guildId);

          // ── Welcome message ───────────────────────────────────────────────────
          const channelId = config?.welcomeChannelId ?? member.guild.systemChannelId;
          if (channelId) {
              const channel = member.guild.channels.cache.get(channelId);
              if (channel?.isTextBased()) {
                  const vars = varsFromMember(member);
                  let embed;
                  if (config?.welcomeEmbedTemplate) {
                      const template = await getTemplate(guildId, config.welcomeEmbedTemplate);
                      if (template) embed = buildEmbedFromTemplate(template, vars, style.color);
                  }
                  if (!embed) {
                      const defaultMsg = "👋 Welcome to **{server}**, {user}! You are member **#{count}**.";
                      const welcomeText = applyVars(config?.welcomeMessage ?? defaultMsg, vars);
                      embed = new EmbedBuilder()
                          .setColor(style.color)
                          .setTitle("👋 Welcome!")
                          .setDescription(welcomeText)
                          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                          .setFooter(style.footer ? { text: style.footer } : { text: member.guild.name })
                          .setTimestamp();
                  }
                  await channel.send({ embeds: [embed] }).catch(() => {});
              }
          }

          // ── Mod-log: member joined ────────────────────────────────────────────
          await sendModLog(member.guild, new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle("📥 Member Joined")
              .addFields(
                  { name: "Member",     value: `${member.user.tag} (${member.id})`, inline: true },
                  { name: "Account Age", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                  { name: "Member #",   value: `${member.guild.memberCount}`, inline: true },
              )
              .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
              .setTimestamp(), "Event Log").catch(() => {});
      } catch (err) {
          console.warn("[GuildMemberAdd] Error:", err.message);
      }
  }
  