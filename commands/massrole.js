import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("massrole")
    .setDescription("Add or remove a role from everyone, all humans, or all bots at once")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
        sub.setName("add")
            .setDescription("Add a role to a group of members")
            .addRoleOption((o) => o.setName("role").setDescription("Role to add").setRequired(true))
            .addStringOption((o) =>
                o.setName("target")
                    .setDescription("Who to give it to")
                    .setRequired(true)
                    .addChoices(
                        { name: "Everyone (humans + bots)", value: "everyone" },
                        { name: "Humans only", value: "humans" },
                        { name: "Bots only", value: "bots" },
                    )))
    .addSubcommand((sub) =>
        sub.setName("remove")
            .setDescription("Remove a role from a group of members")
            .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true))
            .addStringOption((o) =>
                o.setName("target")
                    .setDescription("Who to remove it from")
                    .setRequired(true)
                    .addChoices(
                        { name: "Everyone (humans + bots)", value: "everyone" },
                        { name: "Humans only", value: "humans" },
                        { name: "Bots only", value: "bots" },
                    )));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole("role", true);
    const target = interaction.options.getString("target", true);
    const guild = interaction.guild;
    const { color } = await getGuildStyle(guild.id);

    // Safety checks before deferring
    const botMember = guild.members.me;
    if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({ content: "❌ That role is higher than or equal to my highest role — I can't assign it.", flags: 64 });
    }
    if (role.managed) {
        return interaction.reply({ content: "❌ That role is managed by an integration (e.g. a bot role) and cannot be assigned manually.", flags: 64 });
    }
    if (role.id === guild.id) {
        return interaction.reply({ content: "❌ You can't mass-assign the @everyone role.", flags: 64 });
    }

    // Defer immediately — this will take a while for large servers
    await interaction.deferReply();

    // Fetch all members
    let members;
    try {
        await guild.members.fetch();
        members = guild.members.cache;
    } catch {
        return interaction.editReply("❌ Failed to fetch server members. Make sure the bot has the **Server Members Intent** enabled.");
    }

    // Filter by target
    let filtered;
    if (target === "everyone") filtered = [...members.values()];
    else if (target === "humans") filtered = [...members.values()].filter((m) => !m.user.bot);
    else filtered = [...members.values()].filter((m) => m.user.bot);

    const action = sub === "add" ? "add" : "remove";
    const already = filtered.filter((m) => action === "add" ? m.roles.cache.has(role.id) : !m.roles.cache.has(role.id));
    const toProcess = filtered.filter((m) => action === "add" ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id));

    if (toProcess.length === 0) {
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle("⚠️ Nothing to do")
                .setDescription(`All ${filtered.length} matching members already ${action === "add" ? "have" : "don't have"} <@&${role.id}>.`)],
        });
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("⚙️ Mass Role — Working…")
            .setDescription(`${action === "add" ? "Adding" : "Removing"} <@&${role.id}> ${action === "add" ? "to" : "from"} **${toProcess.length}** members (${already.length} already done). This may take a few minutes for large servers…`)],
    });

    let success = 0;
    let failed = 0;
    const auditReason = `Mass role ${action} by ${interaction.user.tag} — target: ${target}`;

    for (const member of toProcess) {
        try {
            if (action === "add") {
                await member.roles.add(role.id, auditReason);
            } else {
                await member.roles.remove(role.id, auditReason);
            }
            success++;
        } catch {
            failed++;
        }
        // Small delay to respect Discord rate limits (avoid hitting 429s)
        if (success % 10 === 0) await new Promise((r) => setTimeout(r, 250));
    }

    const targetLabel = target === "everyone" ? "everyone" : target === "humans" ? "all humans" : "all bots";
    const verb = action === "add" ? "Added to" : "Removed from";

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(failed === 0 ? color : 0xfee75c)
            .setTitle(`${action === "add" ? "✅" : "🗑️"} Mass Role — Done`)
            .addFields(
                { name: "Role", value: `<@&${role.id}>`, inline: true },
                { name: "Target", value: targetLabel, inline: true },
                { name: "Action", value: action === "add" ? "Add" : "Remove", inline: true },
                { name: `${verb} members`, value: `${success}`, inline: true },
                { name: "Already done / skipped", value: `${already.length}`, inline: true },
                { name: "Failed", value: `${failed}`, inline: true },
            )
            .setFooter({ text: `Executed by ${interaction.user.tag}` })
            .setTimestamp()],
    });
}
