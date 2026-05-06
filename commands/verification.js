import {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} from "discord.js";
import { db, verificationSettingsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("verification")
    .setDescription("Configure the member verification gate")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("setup").setDescription("Create a verification panel")
        .addRoleOption((o) => o.setName("role").setDescription("Role to give verified members").setRequired(true))
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to post the verification panel").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Custom message shown on the panel").setRequired(false)))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable the verification system"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const { color } = await getGuildStyle(guildId);

    if (sub === "setup") {
        const role = interaction.options.getRole("role");
        const channel = interaction.options.getChannel("channel");
        const customMsg = interaction.options.getString("message") ?? "Click the button below to verify yourself and gain access to the server.";

        // Verify bot can manage roles
        const botMember = interaction.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: "❌ I need the **Manage Roles** permission to assign the verification role.", flags: 64 });
        }
        if (botMember.roles.highest.position <= role.position) {
            return interaction.reply({ content: `❌ My highest role must be above **${role.name}** to assign it.`, flags: 64 });
        }

        await db.insert(verificationSettingsTable).values({
            guildId, enabled: true, channelId: channel.id, roleId: role.id, message: customMsg, updatedAt: new Date(),
        }).onConflictDoUpdate({ target: verificationSettingsTable.guildId, set: {
            enabled: true, channelId: channel.id, roleId: role.id, message: customMsg, updatedAt: new Date(),
        }});

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle("✅ Member Verification")
            .setDescription(customMsg)
            .setFooter({ text: "Click the button below to get verified" })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("verify:click")
                .setLabel("Verify Me")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success),
        );
        await channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `✅ Verification panel posted in <#${channel.id}>. Members will receive the **${role.name}** role when they click the button.`, flags: 64 });
    }

    if (sub === "disable") {
        await db.update(verificationSettingsTable).set({ enabled: false, updatedAt: new Date() }).where(eq(verificationSettingsTable.guildId, guildId));
        return interaction.reply({ content: "✅ Verification system disabled.", flags: 64 });
    }
}
