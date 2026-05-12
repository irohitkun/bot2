import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, tempRolesTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { sendModLog } from "../utils/modLog.js";
import { parseDuration, formatDuration } from "../utils/parseDuration.js";
import { safeSetTimeout } from "../utils/giveawayScheduler.js";

export const data = new SlashCommandBuilder()
    .setName("temprole")
    .setDescription("Temporarily assign a role to a member — auto-removed after the duration")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((o) => o.setName("user").setDescription("Member to give the role to").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Role to assign temporarily").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("Duration e.g. 1h, 12h, 7d, 2w").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the temp role").setRequired(false));

export async function execute(interaction) {
    const target = interaction.options.getUser("user", true);
    const role = interaction.options.getRole("role", true);
    const durationStr = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guild = interaction.guild;

    const ms = parseDuration(durationStr);
    if (!ms || ms < 60_000) {
        return interaction.reply({ content: "❌ Invalid or too short duration. Examples: `1h`, `12h`, `7d`, `2w`. Minimum: 1 minute.", flags: 64 });
    }
    const MAX_MS = 365 * 24 * 60 * 60 * 1000;
    if (ms > MAX_MS) return interaction.reply({ content: "❌ Maximum duration is 1 year.", flags: 64 });

    const botMember = guild.members.me;
    if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({ content: "❌ That role is higher than or equal to my highest role — I can't assign it.", flags: 64 });
    }
    if (role.managed) {
        return interaction.reply({ content: "❌ That role is managed by an integration and can't be assigned manually.", flags: 64 });
    }
    if (role.id === guild.id) {
        return interaction.reply({ content: "❌ You can't assign the @everyone role.", flags: 64 });
    }

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ content: "❌ Could not find that member in the server.", flags: 64 });

    await interaction.deferReply();

    const expiresAt = new Date(Date.now() + ms);
    const label = formatDuration(ms);

    await member.roles.add(role.id, `[TempRole: ${label}] ${reason} — by ${interaction.user.tag}`);

    const [row] = await db.insert(tempRolesTable).values({
        guildId: guild.id,
        userId: target.id,
        roleId: role.id,
        moderatorId: interaction.user.id,
        reason,
        expiresAt,
    }).returning();

    const { color } = await getGuildStyle(guild.id);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🏷️ Temp Role Assigned")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Role", value: `<@&${role.id}>`, inline: true },
            { name: "Duration", value: label, inline: true },
            { name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
            { name: "Reason", value: reason },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(color)
        .setTitle("🏷️ Temp Role Assigned")
        .addFields(
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Role", value: `<@&${role.id}>`, inline: true },
            { name: "Duration", value: label, inline: true },
            { name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp()
    );

    scheduleTempRoleRemoval(interaction.client, row.id, guild.id, target.id, role.id, ms);
}

export function scheduleTempRoleRemoval(client, recordId, guildId, userId, roleId, delayMs) {
    safeSetTimeout(async () => {
        try {
            const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
            if (guild) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member?.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId, "Temp role expired").catch(() => {});
                }
                const role = guild.roles.cache.get(roleId);
                const embed = new EmbedBuilder()
                    .setColor(0x95a5a6)
                    .setTitle("🏷️ Temp Role Expired")
                    .addFields(
                        { name: "User", value: `<@${userId}> (${userId})`, inline: true },
                        { name: "Role", value: role ? `<@&${roleId}>` : roleId, inline: true },
                    )
                    .setTimestamp();
                await sendModLog(guild, embed, "TempRole Scheduler");
            }
            await db.update(tempRolesTable)
                .set({ removed: true, removedAt: new Date() })
                .where(eq(tempRolesTable.id, recordId));
        } catch (err) {
            console.error(`[TempRole] Failed to remove temp role #${recordId}:`, err);
        }
    }, delayMs);
}
