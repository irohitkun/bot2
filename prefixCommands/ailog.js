import { PermissionFlagsBits } from "discord.js";
import { hasTier, premiumDeniedEmbed } from "../utils/permissions.js";
import { fetchLogs, buildLogEmbed } from "../commands/ailog.js";

export const command = {
    name: "ailog",
    usage: "%ailog [limit 1-15] [@user]",
    description: "[Premium] View recent AI Assistant audit log entries",
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

        // Parse args: optional number 1-15 and optional user mention
        for (const arg of args) {
            const n = Number.parseInt(arg, 10);
            if (Number.isFinite(n) && n >= 1 && n <= 15) { limit = n; continue; }
            const id = arg.match(/^<@!?(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
            if (id) userId = id[1];
        }
        if (!userId && message.mentions.users.size > 0) {
            userId = message.mentions.users.first().id;
        }

        const rows = await fetchLogs({ guildId: message.guild.id, userId, limit });
        if (rows === null) {
            return void message.reply("❌ The AI audit log table doesn't exist yet. Run `npm run db:push` on your server to create it.");
        }
        const user = userId ? await message.client.users.fetch(userId).catch(() => null) : null;
        return void message.reply(buildLogEmbed(rows, user));
    },
};
