import { PermissionFlagsBits } from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import { db, aiAssistantLogsTable } from "../db/index.js";
import { hasTier, premiumDeniedEmbed } from "../utils/permissions.js";
import { buildLogReply } from "../commands/ailog.js";

export const command = {
    name: "ailog",
    usage: "%ailog [limit] [@user]",
    description: "[Premium] View recent AI Assistant runs (audit log)",
    async execute(message, args) {
        if (!message.guild) return void message.reply("❌ This command only works inside a server.");
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return void message.reply("❌ You need the **Manage Server** permission to view the AI audit log.");
        }
        if (!await hasTier(message.guild.id, "premium")) {
            return void message.reply({ embeds: [premiumDeniedEmbed("AI Assistant Audit Log")] });
        }

        let limit = 5;
        let userId = null;
        for (const arg of args) {
            const n = Number.parseInt(arg, 10);
            if (Number.isFinite(n) && n >= 1 && n <= 15) limit = n;
            const mention = arg.match(/^<@!?(\d+)>$/);
            if (mention) userId = mention[1];
        }
        if (!userId && message.mentions.users.size > 0) userId = message.mentions.users.first().id;

        const where = userId
            ? and(eq(aiAssistantLogsTable.guildId, message.guild.id), eq(aiAssistantLogsTable.userId, userId))
            : eq(aiAssistantLogsTable.guildId, message.guild.id);
        const rows = await db.select().from(aiAssistantLogsTable).where(where).orderBy(desc(aiAssistantLogsTable.createdAt)).limit(limit);

        const user = userId ? await message.client.users.fetch(userId).catch(() => null) : null;
        return void message.reply(buildLogReply(message.guild, rows, user));
    },
};
