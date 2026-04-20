import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { setNoPrefixMode } from "../utils/prefixCache.js";
import { isBotOwner, isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";
import { addNoPrefixAccess, clearNoPrefixAccess, getNoPrefixAccessEntries, removeNoPrefixAccess } from "../utils/noPrefixAccess.js";
export const data = new SlashCommandBuilder()
    .setName("noprefix")
    .setDescription("Manage no-prefix mode access (Premium only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("toggle").setDescription("Enable or disable no-prefix mode")
    .addBooleanOption((opt) => opt.setName("enabled").setDescription("Enable or disable no-prefix mode").setRequired(true)))
    .addSubcommand((sub) => sub.setName("adduser").setDescription("Allow a user to use no-prefix commands")
    .addUserOption((opt) => opt.setName("user").setDescription("User to allow").setRequired(true)))
    .addSubcommand((sub) => sub.setName("removeuser").setDescription("Remove a user's no-prefix access")
    .addUserOption((opt) => opt.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand((sub) => sub.setName("addrole").setDescription("Allow a role to use no-prefix commands")
    .addRoleOption((opt) => opt.setName("role").setDescription("Role to allow").setRequired(true)))
    .addSubcommand((sub) => sub.setName("removerole").setDescription("Remove a role's no-prefix access")
    .addRoleOption((opt) => opt.setName("role").setDescription("Role to remove").setRequired(true)))
    .addSubcommand((sub) => sub.setName("list").setDescription("List who can use no-prefix commands"))
    .addSubcommand((sub) => sub.setName("clear").setDescription("Clear all no-prefix user and role access"));
export async function execute(interaction) {
    const guildId = interaction.guild.id;
    if (interaction.guild.ownerId !== interaction.user.id && !isBotOwner(interaction.user.id)) {
        return interaction.reply({
            content: "❌ Only the server owner can manage no-prefix access.",
            flags: 64,
        });
    }
    const premium = await isPremiumGuild(guildId);
    if (!premium) {
        return interaction.reply({
            embeds: [premiumDeniedEmbed("No-Prefix Mode")],
            flags: 64,
        });
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await setNoPrefixMode(guildId, enabled);
        const embed = new EmbedBuilder()
            .setColor(enabled ? 0x57f287 : 0xed4245)
            .setTitle(`${enabled ? "✅" : "❌"} No-Prefix Mode ${enabled ? "Enabled" : "Disabled"}`)
            .setDescription(enabled
            ? "No-prefix mode is enabled. Only the server owner, allowed users, and allowed roles can use it."
            : "No-prefix mode is disabled. Everyone must use the server prefix.")
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "adduser") {
        const user = interaction.options.getUser("user", true);
        await addNoPrefixAccess(guildId, user.id, "user", interaction.user.id);
        return interaction.reply({ content: `✅ ${user} can now use no-prefix commands.`, flags: 64 });
    }
    if (sub === "removeuser") {
        const user = interaction.options.getUser("user", true);
        await removeNoPrefixAccess(guildId, user.id, "user");
        return interaction.reply({ content: `✅ ${user} can no longer use no-prefix commands.`, flags: 64 });
    }
    if (sub === "addrole") {
        const role = interaction.options.getRole("role", true);
        await addNoPrefixAccess(guildId, role.id, "role", interaction.user.id);
        return interaction.reply({ content: `✅ ${role} can now use no-prefix commands.`, flags: 64 });
    }
    if (sub === "removerole") {
        const role = interaction.options.getRole("role", true);
        await removeNoPrefixAccess(guildId, role.id, "role");
        return interaction.reply({ content: `✅ ${role} can no longer use no-prefix commands.`, flags: 64 });
    }
    if (sub === "list") {
        const rows = await getNoPrefixAccessEntries(guildId);
        const users = rows.filter((row) => row.targetType === "user").map((row) => `<@${row.targetId}>`);
        const roles = rows.filter((row) => row.targetType === "role").map((row) => `<@&${row.targetId}>`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("No-Prefix Access")
            .setDescription("The server owner always has access. If no users or roles are listed, only the owner can use no-prefix commands.")
            .addFields({ name: "Allowed Users", value: users.length ? users.join("\n") : "None", inline: true }, { name: "Allowed Roles", value: roles.length ? roles.join("\n") : "None", inline: true })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }
    if (sub === "clear") {
        await clearNoPrefixAccess(guildId);
        return interaction.reply({ content: "✅ Cleared all no-prefix access. Only the server owner can use no-prefix commands now.", flags: 64 });
    }
}
