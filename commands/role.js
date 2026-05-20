import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("role")
    .setDescription("Role management commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
        sub.setName("add").setDescription("Add a role to a user")
            .addUserOption((o) => o.setName("user").setDescription("The user").setRequired(true))
            .addRoleOption((o) => o.setName("role").setDescription("The role to add").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("remove").setDescription("Remove a role from a user")
            .addUserOption((o) => o.setName("user").setDescription("The user").setRequired(true))
            .addRoleOption((o) => o.setName("role").setDescription("The role to remove").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("members").setDescription("List all members who have a specific role")
            .addRoleOption((o) => o.setName("role").setDescription("The role to list members for").setRequired(true))
            .addIntegerOption((o) => o.setName("page").setDescription("Page number (30 members per page)").setRequired(false).setMinValue(1)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "add" || sub === "remove") {
        const target = interaction.options.getUser("user", true);
        const role = interaction.options.getRole("role", true);
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "❌ Could not find that member.", flags: 64 });

        const botMember = interaction.guild.members.me;
        if (role.position >= botMember.roles.highest.position)
            return interaction.reply({ content: "❌ That role is higher than or equal to my highest role.", flags: 64 });

        if (sub === "add") {
            if (member.roles.cache.has(role.id))
                return interaction.reply({ content: `${target.tag} already has that role.`, flags: 64 });
            await member.roles.add(role.id, `Added by ${interaction.user.tag}`);
            const embed = new EmbedBuilder().setColor(0x57f287).setTitle("✅ Role Added")
                .addFields(
                    { name: "User", value: target.tag, inline: true },
                    { name: "Role", value: `<@&${role.id}>`, inline: true },
                    { name: "By", value: interaction.user.tag, inline: true },
                ).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === "remove") {
            if (!member.roles.cache.has(role.id))
                return interaction.reply({ content: `${target.tag} doesn't have that role.`, flags: 64 });
            await member.roles.remove(role.id, `Removed by ${interaction.user.tag}`);
            const embed = new EmbedBuilder().setColor(0xed4245).setTitle("✅ Role Removed")
                .addFields(
                    { name: "User", value: target.tag, inline: true },
                    { name: "Role", value: `<@&${role.id}>`, inline: true },
                    { name: "By", value: interaction.user.tag, inline: true },
                ).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }
    }

    if (sub === "members") {
        const role = interaction.options.getRole("role", true);
        const pageNum = (interaction.options.getInteger("page") ?? 1) - 1;
        const PAGE = 30;

        // Fetch all members to ensure cache is populated
        await interaction.guild.members.fetch();

        const allMembers = role.members.map((m) => ({
            name: m.user.username,
            nick: m.nickname,
            id: m.user.id,
        }));

        if (allMembers.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(role.color || 0x5865f2)
                    .setTitle(`👥 Members with ${role.name}`)
                    .setDescription("*No members have this role.*")
                    .setTimestamp()],
                flags: 64,
            });
        }

        const totalPages = Math.ceil(allMembers.length / PAGE);
        const page = Math.min(pageNum, totalPages - 1);
        const slice = allMembers.slice(page * PAGE, page * PAGE + PAGE);
        const offset = page * PAGE;

        const desc = slice
            .map((m, i) => `\`${offset + i + 1}.\` **${m.name}**${m.nick ? ` · *${m.nick}*` : ""}`)
            .join("\n");

        const embed = new EmbedBuilder()
            .setColor(role.color || 0x5865f2)
            .setTitle(`👥 Members with ${role.name}`)
            .setDescription(desc)
            .setFooter({ text: `${allMembers.length} member${allMembers.length !== 1 ? "s" : ""} total · Page ${page + 1}/${totalPages}` })
            .setTimestamp();

        // Navigation buttons if multiple pages
        const components = [];
        if (totalPages > 1) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`inrole:${role.id}:${page - 1}`)
                    .setLabel("◀ Prev")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId(`inrole:${role.id}:${page + 1}`)
                    .setLabel("Next ▶")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages - 1),
            );
            components.push(row);
        }

        return interaction.reply({ embeds: [embed], components, flags: 64 });
    }
}
