import { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { db, confessionSettingsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const command = {
    name: "confession",
    description: "Submit an anonymous confession or configure the confession system",
    async execute(message, args) {
        const sub = args[0]?.toLowerCase();
        const guildId = message.guild.id;

        if (sub === "setup") {
            if (!message.member.permissions.has("ManageGuild")) {
                return message.reply("❌ You need Manage Server permission to configure confessions.");
            }
            const channel = message.mentions.channels.first();
            if (!channel) return message.reply("Usage: `confession setup #channel [#review-channel]`");
            const reviewChannel = message.mentions.channels.at(1);
            await db.insert(confessionSettingsTable).values({
                guildId, enabled: true, channelId: channel.id, reviewChannelId: reviewChannel?.id ?? null, updatedAt: new Date(),
            }).onConflictDoUpdate({ target: confessionSettingsTable.guildId, set: {
                enabled: true, channelId: channel.id, reviewChannelId: reviewChannel?.id ?? null, updatedAt: new Date(),
            }});
            return message.reply(`✅ Confession system configured! Confessions go to <#${channel.id}>${reviewChannel ? ` after review in <#${reviewChannel.id}>` : " automatically"}.`);
        }

        if (sub === "disable") {
            if (!message.member.permissions.has("ManageGuild")) {
                return message.reply("❌ You need Manage Server permission.");
            }
            await db.update(confessionSettingsTable).set({ enabled: false, updatedAt: new Date() }).where(eq(confessionSettingsTable.guildId, guildId));
            return message.reply("✅ Confession system disabled.");
        }

        // Default: tell user to use the slash command for the modal
        const [settings] = await db.select().from(confessionSettingsTable).where(eq(confessionSettingsTable.guildId, guildId));
        if (!settings?.enabled || !settings.channelId) {
            return message.reply("❌ The confession system is not enabled in this server.");
        }
        return message.reply("To submit a confession, use `/confession submit` — confessions require the modal form for anonymity.");
    },
};
