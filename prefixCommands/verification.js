import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { db, verificationSettingsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const command = {
    name: "verification",
    description: "Configure the member verification gate",
    async execute(message, args) {
        const sub = args[0]?.toLowerCase();
        const guildId = message.guild.id;

        if (!message.member.permissions.has("ManageGuild")) {
            return message.reply("❌ You need Manage Server permission to configure verification.");
        }

        if (!sub || sub === "status") {
            const [settings] = await db.select().from(verificationSettingsTable).where(eq(verificationSettingsTable.guildId, guildId));
            return message.reply(`📋 Verification: **${settings?.enabled ? "Enabled" : "Disabled"}** | Role: ${settings?.roleId ? `<@&${settings.roleId}>` : "Not set"} | Channel: ${settings?.channelId ? `<#${settings.channelId}>` : "Not set"}`);
        }

        if (sub === "disable") {
            await db.update(verificationSettingsTable).set({ enabled: false, updatedAt: new Date() }).where(eq(verificationSettingsTable.guildId, guildId));
            return message.reply("✅ Verification system disabled.");
        }

        return message.reply("Use `/verification setup` (slash command) to configure the verification panel — it requires specifying a role and channel.");
    },
};
