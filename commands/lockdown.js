import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from "discord.js";
import { getGuildStyle } from "../utils/guildStyle.js";
import { sendModLog } from "../utils/modLog.js";

// In-memory store: guildId → Set<channelId> that *we* locked (so we only unlock those)
const activeLockdowns = new Map();

export const data = new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Emergency server-wide channel lockdown")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
        sub.setName("start")
            .setDescription("Lock ALL text channels immediately (preserves already-locked channels)")
            .addStringOption((o) => o.setName("reason").setDescription("Reason for the lockdown").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("end")
            .setDescription("Lift the lockdown — restores only the channels locked by /lockdown start"))
    .addSubcommand((sub) =>
        sub.setName("status")
            .setDescription("Check whether a lockdown is currently active"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "start")  return handleStart(interaction);
    if (sub === "end")    return handleEnd(interaction);
    if (sub === "status") return handleStatus(interaction);
}

async function handleStart(interaction) {
    await interaction.deferReply();
    const guild = interaction.guild;
    const reason = interaction.options.getString("reason") ?? "Emergency lockdown";
    const me = guild.members.me;

    if (activeLockdowns.has(guild.id)) {
        return interaction.editReply("⚠️ A lockdown is already active. Use `/lockdown end` to lift it first.");
    }

    const textChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText && c.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)
    );

    const lockedByUs = new Set();
    let locked = 0;
    let skipped = 0;

    for (const ch of textChannels.values()) {
        const ow = ch.permissionOverwrites.cache.get(guild.roles.everyone.id);
        const alreadyDenied = ow?.deny?.has(PermissionFlagsBits.SendMessages);
        if (alreadyDenied) { skipped++; continue; }
        try {
            await ch.permissionOverwrites.edit(
                guild.roles.everyone,
                { SendMessages: false },
                { reason: `Lockdown — ${interaction.user.tag}: ${reason}` }
            );
            lockedByUs.add(ch.id);
            locked++;
        } catch { skipped++; }
    }

    activeLockdowns.set(guild.id, lockedByUs);

    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Server Lockdown Active")
        .setDescription("All text channels have been locked. Use `/lockdown end` to restore access.")
        .addFields(
            { name: "Locked Now", value: `${locked} channel(s)`, inline: true },
            { name: "Already Locked", value: `${skipped} (skipped)`, inline: true },
            { name: "Reason", value: reason },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
        )
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Server Lockdown Started")
        .addFields(
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Channels Locked", value: `${locked}`, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp()
    );
}

async function handleEnd(interaction) {
    await interaction.deferReply();
    const guild = interaction.guild;
    const lockedByUs = activeLockdowns.get(guild.id);

    if (!lockedByUs || lockedByUs.size === 0) {
        return interaction.editReply("❌ No active lockdown found for this session. Either none was started, or the bot was restarted during it (use `/lock` / `/unlock` manually in that case).");
    }

    let unlocked = 0;
    let failed = 0;

    for (const channelId of lockedByUs) {
        const ch = guild.channels.cache.get(channelId);
        if (!ch) { failed++; continue; }
        try {
            await ch.permissionOverwrites.edit(
                guild.roles.everyone,
                { SendMessages: null },
                { reason: `Lockdown lifted by ${interaction.user.tag}` }
            );
            unlocked++;
        } catch { failed++; }
    }

    activeLockdowns.delete(guild.id);

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Server Lockdown Lifted")
        .addFields(
            { name: "Channels Restored", value: `${unlocked}`, inline: true },
            { name: "Failed", value: `${failed}`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
        )
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });

    await sendModLog(guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Server Lockdown Lifted")
        .addFields(
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: "Channels Restored", value: `${unlocked}`, inline: true },
        )
        .setTimestamp()
    );
}

async function handleStatus(interaction) {
    const lockedByUs = activeLockdowns.get(interaction.guild.id);
    if (!lockedByUs || lockedByUs.size === 0) {
        return interaction.reply({ content: "✅ No active lockdown — the server is operating normally.", flags: 64 });
    }
    return interaction.reply({
        content: `🔒 **Lockdown is active.** ${lockedByUs.size} channel(s) were locked by the last \`/lockdown start\`. Use \`/lockdown end\` to lift it.`,
        flags: 64,
    });
}
