import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, jailSettingsTable, jailRecordsTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { sendModLog } from "../utils/modLog.js";

export const data = new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Jail system — isolate a member or manage the jail setup")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
        sub.setName("setup")
            .setDescription("Configure the jail role and channel")
            .addRoleOption((o) => o.setName("role").setDescription("Role to apply when jailing (all other roles removed)").setRequired(true))
            .addChannelOption((o) => o.setName("channel").setDescription("Channel jailed members can see/talk in").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("member")
            .setDescription("Jail a member — removes their roles and assigns the jail role")
            .addUserOption((o) => o.setName("user").setDescription("Member to jail").setRequired(true))
            .addStringOption((o) => o.setName("reason").setDescription("Reason for jailing").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("release")
            .setDescription("Release a jailed member — restores their original roles")
            .addUserOption((o) => o.setName("user").setDescription("Member to release").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("config")
            .setDescription("View current jail configuration"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "setup") return handleSetup(interaction);
    if (sub === "member") return handleJail(interaction);
    if (sub === "release") return handleRelease(interaction);
    if (sub === "config") return handleConfig(interaction);
}

async function handleSetup(interaction) {
    const role = interaction.options.getRole("role", true);
    const channel = interaction.options.getChannel("channel");
    const guild = interaction.guild;

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ You need Manage Server to configure jail.", flags: 64 });
    }

    await db.insert(jailSettingsTable).values({
        guildId: guild.id,
        jailRoleId: role.id,
        jailChannelId: channel?.id ?? null,
    }).onConflictDoUpdate({
        target: jailSettingsTable.guildId,
        set: { jailRoleId: role.id, jailChannelId: channel?.id ?? null, updatedAt: new Date() },
    });

    const { color } = await getGuildStyle(guild.id);
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("⚙️ Jail Configured")
        .addFields(
            { name: "Jail Role", value: `<@&${role.id}>`, inline: true },
            { name: "Jail Channel", value: channel ? `<#${channel.id}>` : "None set", inline: true },
        )
        .setFooter({ text: "Use /jail member @user to jail someone" })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleJail(interaction) {
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guild = interaction.guild;

    const [settings] = await db.select().from(jailSettingsTable).where(eq(jailSettingsTable.guildId, guild.id));
    if (!settings?.jailRoleId) {
        return interaction.reply({ content: "❌ Jail is not configured. Run `/jail setup` first.", flags: 64 });
    }

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ content: "❌ Could not find that member.", flags: 64 });
    if (!member.manageable) return interaction.reply({ content: "❌ I can't manage this member — they may have a higher role than me.", flags: 64 });
    if (member.id === interaction.user.id) return interaction.reply({ content: "❌ You cannot jail yourself.", flags: 64 });

    const existingJail = await db.select().from(jailRecordsTable)
        .where(and(eq(jailRecordsTable.guildId, guild.id), eq(jailRecordsTable.userId, target.id), eq(jailRecordsTable.active, true)));
    if (existingJail.length > 0) {
        return interaction.reply({ content: "❌ That member is already jailed. Use `/jail release` first.", flags: 64 });
    }

    const jailRole = guild.roles.cache.get(settings.jailRoleId);
    if (!jailRole) return interaction.reply({ content: "❌ The jail role no longer exists. Reconfigure with `/jail setup`.", flags: 64 });

    await interaction.deferReply();

    const savedRoles = member.roles.cache
        .filter((r) => r.id !== guild.id && r.id !== settings.jailRoleId)
        .map((r) => r.id);

    for (const roleId of savedRoles) {
        await member.roles.remove(roleId, `Jailed by ${interaction.user.tag}: ${reason}`).catch(() => {});
    }
    await member.roles.add(jailRole, `Jailed by ${interaction.user.tag}: ${reason}`).catch(() => {});

    await db.insert(jailRecordsTable).values({
        guildId: guild.id,
        userId: target.id,
        userTag: target.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        savedRoles: savedRoles.join(","),
    });

    const { color } = await getGuildStyle(guild.id);
    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Member Jailed")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
            { name: "Roles Saved", value: `${savedRoles.length} role(s)`, inline: true },
            { name: "Reason", value: reason },
        )
        .setDescription(settings.jailChannelId ? `Member has been isolated to <#${settings.jailChannelId}>.` : "Member's roles have been removed and jail role applied.")
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    try {
        await target.send({
            embeds: [new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("🔒 You have been jailed")
                .setDescription(`You have been jailed in **${guild.name}**.\n\n**Reason:** ${reason}\n\nContact a moderator to be released.`)
                .setTimestamp()],
        });
    } catch {}

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Member Jailed")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Roles Saved", value: `${savedRoles.length}`, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp()
    );
}

async function handleRelease(interaction) {
    const target = interaction.options.getUser("user", true);
    const guild = interaction.guild;

    const [record] = await db.select().from(jailRecordsTable)
        .where(and(eq(jailRecordsTable.guildId, guild.id), eq(jailRecordsTable.userId, target.id), eq(jailRecordsTable.active, true)));

    if (!record) {
        return interaction.reply({ content: "❌ That member is not currently jailed in this server.", flags: 64 });
    }

    const [settings] = await db.select().from(jailSettingsTable).where(eq(jailSettingsTable.guildId, guild.id));
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ content: "❌ Member is no longer in the server.", flags: 64 });

    await interaction.deferReply();

    if (settings?.jailRoleId) {
        await member.roles.remove(settings.jailRoleId, `Released by ${interaction.user.tag}`).catch(() => {});
    }

    const savedRoles = record.savedRoles ? record.savedRoles.split(",").filter(Boolean) : [];
    let restored = 0;
    for (const roleId of savedRoles) {
        const role = guild.roles.cache.get(roleId);
        if (role && !role.managed && role.id !== guild.id) {
            await member.roles.add(roleId, `Jail release — role restored`).catch(() => {});
            restored++;
        }
    }

    await db.update(jailRecordsTable)
        .set({ active: false, releasedAt: new Date(), releasedBy: interaction.user.id })
        .where(eq(jailRecordsTable.id, record.id));

    const { color } = await getGuildStyle(guild.id);
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Member Released")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Released By", value: `${interaction.user.tag}`, inline: true },
            { name: "Roles Restored", value: `${restored} role(s)`, inline: true },
            { name: "Original Reason", value: record.reason },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    try {
        await target.send({
            embeds: [new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("🔓 You have been released")
                .setDescription(`You have been released from jail in **${guild.name}**. Your roles have been restored.`)
                .setTimestamp()],
        });
    } catch {}

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Member Released from Jail")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Released By", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Roles Restored", value: `${restored}`, inline: true },
        )
        .setTimestamp()
    );
}

async function handleConfig(interaction) {
    const [settings] = await db.select().from(jailSettingsTable).where(eq(jailSettingsTable.guildId, interaction.guild.id));
    const { color } = await getGuildStyle(interaction.guild.id);

    if (!settings?.jailRoleId) {
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⚙️ Jail — Not Configured")
                .setDescription("Run `/jail setup` to configure the jail role and optional jail channel.")],
            flags: 64,
        });
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("⚙️ Jail Configuration")
        .addFields(
            { name: "Jail Role", value: `<@&${settings.jailRoleId}>`, inline: true },
            { name: "Jail Channel", value: settings.jailChannelId ? `<#${settings.jailChannelId}>` : "Not set", inline: true },
        )
        .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
}
