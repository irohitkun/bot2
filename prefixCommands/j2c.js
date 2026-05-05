import { EmbedBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { parseMention } from "./index.js";
import { db, j2cHubsTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { isPremium } from "../utils/permissions.js";

export const command = {
    name: "j2c",
    usage: "%j2c setup <#vc> [template] | %j2c remove <#vc> | %j2c list",
    description: "Manage Join-to-Create voice hubs (premium)",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return void message.reply("❌ You need **Manage Channels** permission.");
        }
        const sub = args[0]?.toLowerCase();

        if (sub === "list") {
            const hubs = await db.select().from(j2cHubsTable).where(eq(j2cHubsTable.guildId, message.guild.id));
            if (hubs.length === 0) return void message.reply("No J2C hubs configured. Use `%j2c setup <#vc>` to create one.");
            const lines = hubs.map((h) => `<#${h.channelId}> — \`${h.nameTemplate}\` · limit: ${h.userLimit === 0 ? "∞" : h.userLimit}`);
            return void message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🎙️ J2C Hubs").setDescription(lines.join("\n"))] });
        }

        if (!await isPremium(message.guild.id)) {
            return void message.reply("⭐ J2C is a premium feature.");
        }

        if (sub === "setup") {
            const channelRef = args[1];
            if (!channelRef) return void message.reply("Usage: `%j2c setup <#vc> [name template]`");
            const channelId = parseMention(channelRef) ?? channelRef;
            const channel = message.guild.channels.cache.get(channelId);
            if (!channel || channel.type !== ChannelType.GuildVoice) return void message.reply("❌ Please mention a valid voice channel.");
            const template = args.slice(2).join(" ") || "{user}'s Channel";
            await db.insert(j2cHubsTable).values({ guildId: message.guild.id, channelId, nameTemplate: template, userLimit: 0, bitrate: 64, createdBy: message.author.id })
                .onConflictDoUpdate({ target: [j2cHubsTable.channelId], set: { nameTemplate: template, createdBy: message.author.id } });
            return void message.reply(`✅ J2C hub set up for ${channel}. Template: \`${template}\``);
        }

        if (sub === "remove") {
            const channelId = parseMention(args[1]) ?? args[1];
            if (!channelId) return void message.reply("Usage: `%j2c remove <#vc>`");
            const result = await db.delete(j2cHubsTable).where(and(eq(j2cHubsTable.guildId, message.guild.id), eq(j2cHubsTable.channelId, channelId))).returning();
            if (result.length === 0) return void message.reply("❌ That channel is not a J2C hub.");
            return void message.reply(`✅ J2C removed from <#${channelId}>.`);
        }

        return void message.reply(`Usage:\n\`\`\`\n${this.usage}\n\`\`\``);
    },
};
