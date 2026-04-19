import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { pool } from "../db/index.js";
import { getGuildStyle } from "../utils/guildStyle.js";

const requiredPermissions = [
    ["Send Messages", PermissionFlagsBits.SendMessages],
    ["Embed Links", PermissionFlagsBits.EmbedLinks],
    ["Read Message History", PermissionFlagsBits.ReadMessageHistory],
    ["Manage Messages", PermissionFlagsBits.ManageMessages],
    ["Moderate Members", PermissionFlagsBits.ModerateMembers],
    ["Manage Roles", PermissionFlagsBits.ManageRoles],
    ["Manage Channels", PermissionFlagsBits.ManageChannels],
    ["Add Reactions", PermissionFlagsBits.AddReactions],
];

export const command = {
    name: "setupcheck",
    usage: "%setupcheck",
    description: "Check bot setup and permissions",
    async execute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply("You need Manage Server permission to run this check.");
        }

        const { color } = await getGuildStyle(message.guild.id);
        const permissions = message.guild.members.me.permissionsIn(message.channel);
        const missing = requiredPermissions
            .filter(([, permission]) => !permissions.has(permission))
            .map(([label]) => label);

        let databaseReady = false;
        let databaseMessage = "Connected";
        try {
            await pool.query("select 1");
            databaseReady = true;
        } catch (error) {
            databaseMessage = error.message;
        }

        const checks = [
            ["Discord token", !!process.env.DISCORD_BOT_TOKEN],
            ["Database", databaseReady],
            ["Message content intent", process.env.MESSAGE_CONTENT_INTENT_ENABLED === "true"],
            ["Required permissions", missing.length === 0],
        ];

        const embed = new EmbedBuilder()
            .setColor(missing.length === 0 && databaseReady ? color : 0xfee75c)
            .setTitle("Setup Check")
            .addFields(
                { name: "Status", value: checks.map(([label, ok]) => `${ok ? "Ready" : "Needs attention"}: ${label}`).join("\n") },
                { name: "Missing Permissions", value: missing.length ? missing.join(", ") : "None" },
                { name: "Database Detail", value: databaseMessage.slice(0, 900) },
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },
};