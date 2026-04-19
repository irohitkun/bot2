import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
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

export const data = new SlashCommandBuilder()
    .setName("setupcheck")
    .setDescription("Check whether the bot is configured correctly")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    const { color } = await getGuildStyle(interaction.guild.id);
    const botMember = interaction.guild.members.me;
    const permissions = botMember.permissionsIn(interaction.channel);
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
            {
                name: "Status",
                value: checks.map(([label, ok]) => `${ok ? "Ready" : "Needs attention"}: ${label}`).join("\n"),
            },
            {
                name: "Missing Permissions",
                value: missing.length ? missing.join(", ") : "None",
            },
            {
                name: "Database Detail",
                value: databaseMessage.slice(0, 900),
            },
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}