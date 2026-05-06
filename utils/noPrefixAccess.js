import { db, noPrefixAccessTable } from "../db/index.js";
  import { and, eq } from "drizzle-orm";
  import { getNoPrefixMode } from "./prefixCache.js";

  const accessCache = new Map();

  export async function getNoPrefixAccessEntries(guildId) {
      if (accessCache.has(guildId)) return accessCache.get(guildId);
      const rows = await db.select().from(noPrefixAccessTable).where(eq(noPrefixAccessTable.guildId, guildId));
      accessCache.set(guildId, rows);
      return rows;
  }

  export async function addNoPrefixAccess(guildId, targetId, targetType, createdBy) {
      await db.insert(noPrefixAccessTable).values({ guildId, targetId, targetType, createdBy }).onConflictDoNothing();
      accessCache.delete(guildId);
  }

  export async function removeNoPrefixAccess(guildId, targetId, targetType) {
      await db.delete(noPrefixAccessTable).where(and(
          eq(noPrefixAccessTable.guildId, guildId),
          eq(noPrefixAccessTable.targetId, targetId),
          eq(noPrefixAccessTable.targetType, targetType),
      ));
      accessCache.delete(guildId);
  }

  export async function clearNoPrefixAccess(guildId) {
      await db.delete(noPrefixAccessTable).where(eq(noPrefixAccessTable.guildId, guildId));
      accessCache.delete(guildId);
  }

  /**
   * Returns true only if no-prefix mode is enabled for this guild AND the member
   * is the guild owner or is in the allowlist.
   */
  export async function canUseNoPrefix(member) {
      if (!member?.guild) return false;

      // No-prefix mode must be enabled for this specific guild first
      const noPrefixEnabled = await getNoPrefixMode(member.guild.id);
      if (!noPrefixEnabled) return false;

      // Guild owner always has access when no-prefix mode is on
      if (member.guild.ownerId === member.id) return true;

      const entries = await getNoPrefixAccessEntries(member.guild.id);
      if (entries.length === 0) return false;

      const userAllowed = entries.some((e) => e.targetType === "user" && e.targetId === member.id);
      if (userAllowed) return true;

      return entries.some((e) => e.targetType === "role" && member.roles.cache.has(e.targetId));
  }
  