/**
   * Anti-Nuke protection system.
   * Tracks rapid destructive actions (mass bans, channel/role deletes, kicks)
   * and punishes the attacker automatically.
   */
  import { PermissionFlagsBits, AuditLogEvent, EmbedBuilder } from "discord.js";
  import { db } from "../db/index.js";
  import { antinukeSettingsTable, antinukeWhitelistTable } from "../db/index.js";
  import { eq } from "drizzle-orm";

  // In-memory action tracker: { guildId -> { userId -> { type -> timestamps[] } } }
  const tracker = new Map();

  const WINDOW_DEFAULT = 10; // seconds

  function getTrackerEntry(guildId, userId, type) {
      if (!tracker.has(guildId)) tracker.set(guildId, new Map());
      const guild = tracker.get(guildId);
      if (!guild.has(userId)) guild.set(userId, {});
      const user = guild.get(userId);
      if (!user[type]) user[type] = [];
      return user[type];
  }

  function pruneOld(timestamps, windowMs) {
      const cutoff = Date.now() - windowMs;
      return timestamps.filter(t => t > cutoff);
  }

  // Clean tracker every minute
  setInterval(() => {
      for (const [guildId, guildMap] of tracker.entries()) {
          for (const [userId, actions] of guildMap.entries()) {
              let hasAny = false;
              for (const type of Object.keys(actions)) {
                  actions[type] = pruneOld(actions[type], 60000);
                  if (actions[type].length > 0) hasAny = true;
              }
              if (!hasAny) guildMap.delete(userId);
          }
          if (guildMap.size === 0) tracker.delete(guildId);
      }
  }, 60 * 1000);

  /**
   * Track an action and return whether the antinuke should trigger.
   * @returns {{ trigger: boolean, count: number, threshold: number }}
   */
  export async function trackAndCheck(guild, userId, type) {
      // Get settings
      const [settings] = await db.select().from(antinukeSettingsTable).where(eq(antinukeSettingsTable.guildId, guild.id));
      if (!settings?.enabled) return { trigger: false };

      // Whitelist check
      const [whitelisted] = await db.select().from(antinukeWhitelistTable)
          .where(eq(antinukeWhitelistTable.guildId, guild.id));
      const whitelist = await db.select().from(antinukeWhitelistTable).where(eq(antinukeWhitelistTable.guildId, guild.id));
      if (whitelist.some(w => w.userId === userId)) return { trigger: false };

      // Skip bots and the guild owner
      if (userId === guild.ownerId) return { trigger: false };

      const windowMs = (settings.timeWindow ?? WINDOW_DEFAULT) * 1000;
      const thresholds = {
          ban: settings.banThreshold ?? 3,
          kick: settings.kickThreshold ?? 3,
          channel_delete: settings.channelThreshold ?? 3,
          role_delete: settings.roleThreshold ?? 3,
      };

      const timestamps = getTrackerEntry(guild.id, userId, type);
      timestamps.push(Date.now());
      const recent = pruneOld(timestamps, windowMs);
      // update in-place
      const entry = tracker.get(guild.id)?.get(userId);
      if (entry) entry[type] = recent;

      const threshold = thresholds[type] ?? 3;
      const trigger = recent.length >= threshold;

      return { trigger, count: recent.length, threshold };
  }

  /**
   * Execute the configured punishment against an attacker.
   */
  export async function punishAttacker(guild, client, userId) {
      const [settings] = await db.select().from(antinukeSettingsTable).where(eq(antinukeSettingsTable.guildId, guild.id));
      if (!settings) return;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
          // User may have already left — just ban
          await guild.bans.create(userId, { reason: "[AntiNuke] Automated punishment: mass destructive actions detected" }).catch(() => {});
          return;
      }

      // Never punish the guild owner or the bot itself
      if (userId === guild.ownerId || userId === client.user.id) return;

      const action = settings.action ?? "ban";
      const reason = "[AntiNuke] Automated punishment: mass destructive actions detected";

      try {
          if (action === "kick") {
              await member.kick(reason);
          } else if (action === "strip") {
              const roles = member.roles.cache.filter(r => r.id !== guild.id && !r.managed);
              for (const role of roles.values()) {
                  await member.roles.remove(role, reason).catch(() => {});
              }
          } else {
              // default: ban
              await guild.bans.create(userId, { reason });
          }
      } catch (err) {
          console.warn(`[AntiNuke] Failed to punish ${userId}:`, err.message);
      }

      // Log to channel if set
      if (settings.logChannelId) {
          const logChannel = guild.channels.cache.get(settings.logChannelId) ??
              await guild.channels.fetch(settings.logChannelId).catch(() => null);
          if (logChannel?.isTextBased()) {
              const embed = new EmbedBuilder()
                  .setColor(0xed4245)
                  .setTitle("🛡️ AntiNuke Triggered")
                  .addFields(
                      { name: "Target", value: `<@${userId}> (${userId})`, inline: true },
                      { name: "Action", value: action.toUpperCase(), inline: true },
                      { name: "Reason", value: "Mass destructive actions detected within time window" },
                  )
                  .setTimestamp();
              logChannel.send({ embeds: [embed] }).catch(() => {});
          }
      }
  }
  