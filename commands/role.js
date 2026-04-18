import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add or remove a role from a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) => sub.setName("add").setDescription("Add a role to a user")
    .addUserOption((o) => o.setName("user").setDescription("The user").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("The role to add").setRequired(true)))
    .addSubcommand((sub) => sub.setName("remove").setDescription("Remove a role from a user")
    .addUserOption((o) => o.setName("user").setDescription("The user").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("The role to remove").setRequired(true)));
export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser("user", true);
    const role = interaction.options.getRole("role", true);
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member)
        return interaction.reply({ content: "❌ Could not find that member.", flags: 64 });
    const botMember = interaction.guild.members.me;
    if (role.position >= botMember.roles.highest.position)
        return interaction.reply({ content: "❌ That role is higher than or equal to my highest role.", flags: 64 });
    if (sub === "add") {
        if (member.roles.cache.has(role.id))
            return interaction.reply({ content: `${target.tag} already has that role.`, flags: 64 });
        await member.roles.add(role.id, `Added by ${interaction.user.tag}`);
        const embed = new EmbedBuilder().setColor(0x57f287).setTitle("✅ Role Added")
            .addFields({ name: "User", value: target.tag, inline: true }, { name: "Role", value: `<@&${role.id}>`, inline: true }, { name: "By", value: interaction.user.tag, inline: true })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "remove") {
        if (!member.roles.cache.has(role.id))
            return interaction.reply({ content: `${target.tag} doesn't have that role.`, flags: 64 });
        await member.roles.remove(role.id, `Removed by ${interaction.user.tag}`);
        const embed = new EmbedBuilder().setColor(0xed4245).setTitle("✅ Role Removed")
            .addFields({ name: "User", value: target.tag, inline: true }, { name: "Role", value: `<@&${role.id}>`, inline: true }, { name: "By", value: interaction.user.tag, inline: true })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
}
