import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages in a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
        sub.setName("amount")
            .setDescription("Delete the last N messages (optionally filter by user)")
            .addIntegerOption((o) => o.setName("count").setDescription("Number of messages to delete (1–100)").setMinValue(1).setMaxValue(100).setRequired(true))
            .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("user")
            .setDescription("Delete up to 100 recent messages from a specific user")
            .addUserOption((o) => o.setName("user").setDescription("The user whose messages to delete").setRequired(true))
            .addIntegerOption((o) => o.setName("count").setDescription("How many messages to scan (1–100, default 100)").setMinValue(1).setMaxValue(100).setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("until")
            .setDescription("Delete all messages back to a specific message ID (not including it)")
            .addStringOption((o) => o.setName("message_id").setDescription("Stop purging at this message ID").setRequired(true))
            .addChannelOption((o) => o.setName("channel").setDescription("Channel to purge (defaults to current)").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("from")
            .setDescription("Delete all messages after a specific message ID up to now")
            .addStringOption((o) => o.setName("message_id").setDescription("Delete all messages after this message ID").setRequired(true))
            .addChannelOption((o) => o.setName("channel").setDescription("Channel to purge (defaults to current)").setRequired(false)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "amount") return handleAmount(interaction);
    if (sub === "user")   return handleUser(interaction);
    if (sub === "until")  return handleUntil(interaction);
    if (sub === "from")   return handleFrom(interaction);
}

async function handleAmount(interaction) {
    await interaction.deferReply({ flags: 64 });
    const count = interaction.options.getInteger("count", true);
    const filterUser = interaction.options.getUser("user");
    const channel = interaction.channel;

    const fetched = await channel.messages.fetch({ limit: count });
    let toDelete = [...fetched.values()].filter((m) => m.createdTimestamp > Date.now() - TWO_WEEKS);
    if (filterUser) toDelete = toDelete.filter((m) => m.author.id === filterUser.id);
    if (toDelete.length === 0) return interaction.editReply("❌ No eligible messages found (must be within 14 days).");

    const deleted = await channel.bulkDelete(toDelete, true);
    return interaction.editReply({ embeds: [purgeEmbed(deleted.size, channel, interaction.user.tag, filterUser ? `User: ${filterUser.tag}` : null)] });
}

async function handleUser(interaction) {
    await interaction.deferReply({ flags: 64 });
    const user = interaction.options.getUser("user", true);
    const count = interaction.options.getInteger("count") ?? 100;
    const channel = interaction.channel;

    const fetched = await channel.messages.fetch({ limit: count });
    const toDelete = [...fetched.values()].filter(
        (m) => m.author.id === user.id && m.createdTimestamp > Date.now() - TWO_WEEKS
    );
    if (toDelete.length === 0) return interaction.editReply(`❌ No recent messages from ${user.tag} found in the last ${count} messages.`);

    const deleted = await channel.bulkDelete(toDelete, true);
    return interaction.editReply({ embeds: [purgeEmbed(deleted.size, channel, interaction.user.tag, `User: ${user.tag}`)] });
}

async function handleUntil(interaction) {
    await interaction.deferReply({ flags: 64 });
    const messageId = interaction.options.getString("message_id", true).trim();
    if (!/^\d{15,21}$/.test(messageId)) return interaction.editReply("❌ Invalid message ID. Right-click a message → Copy Message ID.");
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;

    let totalDeleted = 0;
    let lastId;
    let reached = false;

    while (totalDeleted < 500) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        const batch = await channel.messages.fetch(opts).catch(() => null);
        if (!batch || batch.size === 0) break;

        const toDelete = [];
        for (const msg of batch.values()) {
            if (msg.id === messageId) { reached = true; break; }
            if (msg.createdTimestamp > Date.now() - TWO_WEEKS) toDelete.push(msg);
        }
        if (toDelete.length > 0) {
            const del = await channel.bulkDelete(toDelete, true).catch(() => null);
            totalDeleted += del?.size ?? 0;
        }
        if (reached || batch.size < 100) break;
        lastId = batch.last()?.id;
    }

    if (totalDeleted === 0) return interaction.editReply("❌ No eligible messages found (all may be older than 14 days, or message ID not found).");
    return interaction.editReply({ embeds: [purgeEmbed(totalDeleted, channel, interaction.user.tag, `Until: \`${messageId}\``)] });
}

async function handleFrom(interaction) {
    await interaction.deferReply({ flags: 64 });
    const messageId = interaction.options.getString("message_id", true).trim();
    if (!/^\d{15,21}$/.test(messageId)) return interaction.editReply("❌ Invalid message ID. Right-click a message → Copy Message ID.");
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;

    const batch = await channel.messages.fetch({ limit: 100, after: messageId }).catch(() => null);
    if (!batch || batch.size === 0) return interaction.editReply("❌ No messages found after that message ID.");

    const toDelete = [...batch.values()].filter((m) => m.createdTimestamp > Date.now() - TWO_WEEKS);
    if (toDelete.length === 0) return interaction.editReply("❌ No eligible messages within the 14-day window.");

    const deleted = await channel.bulkDelete(toDelete, true);
    return interaction.editReply({ embeds: [purgeEmbed(deleted.size, channel, interaction.user.tag, `From: \`${messageId}\``)] });
}

function purgeEmbed(count, channel, moderatorTag, detail) {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🗑️ Messages Purged")
        .addFields(
            { name: "Deleted", value: `${count} message(s)`, inline: true },
            { name: "Channel", value: channel.toString(), inline: true },
            { name: "Moderator", value: moderatorTag, inline: true },
        )
        .setTimestamp();
    if (detail) embed.addFields({ name: "Filter", value: detail, inline: false });
    return embed;
}
