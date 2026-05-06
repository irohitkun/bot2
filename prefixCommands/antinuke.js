import { EmbedBuilder } from "discord.js";
import { db, antinukeSettingsTable, antinukeWhitelistTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const command = {
    name: "antinuke",
    description: "Manage antinuke protection (admin only)",
    async execute(message, args) {
        if (!message.member.permissions.has("Administrator") && message.guild.ownerId !== message.author.id) {
            return message.reply("❌ You need Administrator permission to manage antinuke.");
        }
        const sub = args[0]?.toLowerCase();
        const guildId = message.guild.id;
        const { color } = await getGuildStyle(guildId);

        if (!sub || sub === "status") {
            const [settings] = await db.select().from(antinukeSettingsTable).where(eq(antinukeSettingsTable.guildId, guildId));
            const whitelist = await db.select().from(antinukeWhitelistTable).where(eq(antinukeWhitelistTable.guildId, guildId));
            const embed = new EmbedBuilder().setColor(color).setTitle("🛡️ AntiNuke Status")
                .addFields(
                    { name: "Status", value: settings?.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
                    { name: "Action", value: settings?.action ?? "ban", inline: true },
                    { name: "Time Window", value: (settings?.timeWindow ?? 10) + "s", inline: true },
                    { name: "Thresholds", value: `Ban: ${settings?.banThreshold ?? 3} | Kick: ${settings?.kickThreshold ?? 3} | Channel: ${settings?.channelThreshold ?? 3} | Role: ${settings?.roleThreshold ?? 3}`, inline: false },
                    { name: "Whitelisted", value: whitelist.length > 0 ? whitelist.map((w) => `<@${w.userId}>`).join(", ") : "None", inline: false },
                ).setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        if (sub === "enable") {
            await db.insert(antinukeSettingsTable).values({ guildId, enabled: true, updatedAt: new Date() })
                .onConflictDoUpdate({ target: antinukeSettingsTable.guildId, set: { enabled: true, updatedAt: new Date() } });
            return message.reply("✅ AntiNuke enabled.");
        }
        if (sub === "disable") {
            await db.update(antinukeSettingsTable).set({ enabled: false, updatedAt: new Date() }).where(eq(antinukeSettingsTable.guildId, guildId));
            return message.reply("⚠️ AntiNuke disabled.");
        }
        if (sub === "whitelist") {
            const userId = message.mentions.users.first()?.id ?? args[1];
            if (!userId) return message.reply("Usage: `antinuke whitelist @user`");
            await db.insert(antinukeWhitelistTable).values({ guildId, userId }).onConflictDoNothing();
            return message.reply(`✅ <@${userId}> added to the whitelist.`);
        }
        if (sub === "unwhitelist") {
            const userId = message.mentions.users.first()?.id ?? args[1];
            if (!userId) return message.reply("Usage: `antinuke unwhitelist @user`");
            await db.delete(antinukeWhitelistTable).where(and(eq(antinukeWhitelistTable.guildId, guildId), eq(antinukeWhitelistTable.userId, userId)));
            return message.reply(`✅ <@${userId}> removed from whitelist.`);
        }
        return message.reply("Usage: `antinuke [enable|disable|whitelist|unwhitelist|status]`");
    },
};
