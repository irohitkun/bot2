import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, giveawaysTable } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { isPremiumGuild, premiumDeniedEmbed, getPremiumTip } from "../utils/permissions.js";
import {
    scheduleGiveawayEnd,
    pickGiveawayWinners,
    buildRequirementsBlock,
} from "../utils/giveawayScheduler.js";
import { parseDuration } from "../utils/duration.js";

// Long delays are chunked via safeSetTimeout in the scheduler, so we are not
// bound by Node's ~24.8d setTimeout limit.
const MAX_GIVEAWAY_MS = 30 * 24 * 60 * 60 * 1000;

function parseGiveawayDuration(input) {
    const ms = parseDuration(input);
    if (ms === null || ms <= 0 || ms > MAX_GIVEAWAY_MS) return null;
    return ms;
}

function buildStartEmbed(row, hostTag) {
    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🎉 GIVEAWAY 🎉")
        .setDescription(
            `**Prize:** ${row.prize}\n\nReact with 🎉 to enter!\n\n` +
            `**Ends:** <t:${Math.floor(row.endsAt.getTime() / 1000)}:R>\n` +
            `**Winners:** ${row.winnersCount}` +
            buildRequirementsBlock(row),
        )
        .setFooter({ text: `Hosted by ${hostTag}` })
        .setTimestamp(row.endsAt);
}

export const data = new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("start").setDescription("Start a giveaway")
        .addStringOption((o) => o.setName("prize").setDescription("What are you giving away?").setRequired(true))
        .addStringOption((o) => o.setName("duration").setDescription("Duration e.g. 10m, 1h, 1d12h (max 30d)").setRequired(true))
        .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(20).setRequired(false))
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to post in (defaults to current)").setRequired(false))
        .addRoleOption((o) => o.setName("required_role").setDescription("Only members with this role can win").setRequired(false))
        .addIntegerOption((o) => o.setName("min_account_age").setDescription("Minimum Discord account age in days").setMinValue(1).setMaxValue(3650).setRequired(false))
        .addRoleOption((o) => o.setName("bonus_role").setDescription("Role that gets bonus entries").setRequired(false))
        .addIntegerOption((o) => o.setName("bonus_entries").setDescription("Extra entries for bonus role members (default 1)").setMinValue(1).setMaxValue(10).setRequired(false)))
    .addSubcommand((sub) => sub.setName("end").setDescription("End a giveaway early (picks winners now)")
        .addStringOption((o) => o.setName("message_id").setDescription("Message ID of the giveaway").setRequired(true)))
    .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel a giveaway with no winners")
        .addStringOption((o) => o.setName("message_id").setDescription("Message ID of the giveaway").setRequired(true)))
    .addSubcommand((sub) => sub.setName("list").setDescription("List all active giveaways in this server"))
    .addSubcommand((sub) => sub.setName("extend").setDescription("Extend an active giveaway")
        .addStringOption((o) => o.setName("message_id").setDescription("Message ID of the giveaway").setRequired(true))
        .addStringOption((o) => o.setName("duration").setDescription("Extra time e.g. 30m, 2h, 5d").setRequired(true)))
    .addSubcommand((sub) => sub.setName("reroll").setDescription("Reroll winners for a finished giveaway")
        .addStringOption((o) => o.setName("message_id").setDescription("Message ID of the giveaway").setRequired(true)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === "start") {
        const prize = interaction.options.getString("prize", true);
        const durationStr = interaction.options.getString("duration", true);
        const winnersCount = interaction.options.getInteger("winners") ?? 1;
        const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
        const requiredRole = interaction.options.getRole("required_role");
        const minAccountAgeDays = interaction.options.getInteger("min_account_age");
        const bonusRole = interaction.options.getRole("bonus_role");
        const bonusEntries = interaction.options.getInteger("bonus_entries") ?? (bonusRole ? 1 : 0);

        const durationMs = parseGiveawayDuration(durationStr);
        if (!durationMs)
            return interaction.reply({ content: "❌ Invalid duration. Use formats like `10m`, `1h`, `1d12h` (max 30 days).", flags: 64 });

        const endsAt = new Date(Date.now() + durationMs);
        const insertValues = {
            guildId,
            channelId: targetChannel.id,
            messageId: "pending",
            prize,
            winnersCount,
            hostId: interaction.user.id,
            hostTag: interaction.user.tag,
            endsAt,
            requiredRoleId: requiredRole?.id ?? null,
            minAccountAgeDays: minAccountAgeDays ?? null,
            bonusRoleIds: bonusRole ? bonusRole.id : "",
            bonusEntries: bonusRole ? bonusEntries : 0,
        };

        const previewRow = { ...insertValues };
        const msg = await targetChannel.send({ embeds: [buildStartEmbed(previewRow, interaction.user.tag)] });
        await msg.react("🎉");

        insertValues.messageId = msg.id;
        const [inserted] = await db.insert(giveawaysTable).values(insertValues).returning();

        const premium = await isPremiumGuild(guildId);
        const tipLine = premium ? "" : `\n-# ${getPremiumTip("giveaway")}`;
        await interaction.reply({ content: `✅ Giveaway started in ${targetChannel}!${tipLine}`, flags: 64 });
        scheduleGiveawayEnd(interaction.client, inserted);
        return;
    }

    if (sub === "end") {
        const messageId = interaction.options.getString("message_id", true).trim();
        const [row] = await db.select().from(giveawaysTable)
            .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, false)));
        if (!row)
            return interaction.reply({ content: "❌ No active giveaway found with that message ID.", flags: 64 });

        const channel = await interaction.client.channels.fetch(row.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
        const winners = message ? await pickGiveawayWinners(message, row) : [];

        await db.update(giveawaysTable).set({ ended: true, winners: winners.join(",") })
            .where(eq(giveawaysTable.messageId, messageId));

        if (message) {
            const endEmbed = new EmbedBuilder()
                .setColor(winners.length > 0 ? 0x57f287 : 0xed4245)
                .setTitle("🎉 Giveaway Ended!")
                .setDescription(winners.length > 0
                    ? `**Prize:** ${row.prize}\n**Winners:** ${winners.map((id) => `<@${id}>`).join(", ")}`
                    : `**Prize:** ${row.prize}\n\nNo valid entries!`)
                .setTimestamp();
            await message.edit({ embeds: [endEmbed] }).catch(() => {});
            if (winners.length > 0 && channel)
                await channel.send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${row.prize}**!`).catch(() => {});
        }

        return interaction.reply({
            content: winners.length > 0
                ? `✅ Giveaway ended! Winners: ${winners.map((id) => `<@${id}>`).join(", ")}`
                : "✅ Giveaway ended! No valid entries.",
            flags: 64,
        });
    }

    if (sub === "cancel") {
        const messageId = interaction.options.getString("message_id", true).trim();
        const [row] = await db.select().from(giveawaysTable)
            .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, false)));
        if (!row)
            return interaction.reply({ content: "❌ No active giveaway found with that message ID.", flags: 64 });

        await db.update(giveawaysTable)
            .set({ ended: true, cancelled: true, winners: "" })
            .where(eq(giveawaysTable.id, row.id));

        const channel = await interaction.client.channels.fetch(row.channelId).catch(() => null);
        if (channel) {
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) {
                const cancelledEmbed = new EmbedBuilder()
                    .setColor(0x95a5a6)
                    .setTitle("🚫 Giveaway Cancelled")
                    .setDescription(`**Prize:** ${row.prize}\n\nThis giveaway was cancelled by a moderator.`)
                    .setTimestamp();
                await message.edit({ embeds: [cancelledEmbed] }).catch(() => {});
            }
        }
        return interaction.reply({ content: "🚫 Giveaway cancelled. No winners were picked.", flags: 64 });
    }

    if (sub === "list") {
        const active = await db.select().from(giveawaysTable)
            .where(and(eq(giveawaysTable.guildId, guildId), eq(giveawaysTable.ended, false)))
            .orderBy(desc(giveawaysTable.endsAt));
        if (active.length === 0)
            return interaction.reply({ content: "📭 No active giveaways in this server.", flags: 64 });

        const lines = active.slice(0, 25).map((row) => {
            const link = `https://discord.com/channels/${row.guildId}/${row.channelId}/${row.messageId}`;
            const reqs = [];
            if (row.requiredRoleId) reqs.push(`role <@&${row.requiredRoleId}>`);
            if (row.minAccountAgeDays) reqs.push(`age ${row.minAccountAgeDays}d`);
            const reqLine = reqs.length > 0 ? ` • ${reqs.join(", ")}` : "";
            return `• **${row.prize}** — ${row.winnersCount} winner${row.winnersCount > 1 ? "s" : ""} — ends <t:${Math.floor(row.endsAt.getTime() / 1000)}:R>${reqLine}\n  [Jump](${link}) • \`${row.messageId}\``;
        });

        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`🎉 Active Giveaways (${active.length})`)
            .setDescription(lines.join("\n\n").slice(0, 4000))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "extend") {
        const messageId = interaction.options.getString("message_id", true).trim();
        const extraStr = interaction.options.getString("duration", true);
        const extraMs = parseGiveawayDuration(extraStr);
        if (!extraMs)
            return interaction.reply({ content: "❌ Invalid duration. Use formats like `30m`, `2h`, `1d12h` (max 30 days).", flags: 64 });

        const [row] = await db.select().from(giveawaysTable)
            .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, false)));
        if (!row)
            return interaction.reply({ content: "❌ No active giveaway found with that message ID.", flags: 64 });

        const newEndsAt = new Date(row.endsAt.getTime() + extraMs);
        if (newEndsAt.getTime() - Date.now() > MAX_GIVEAWAY_MS)
            return interaction.reply({ content: "❌ That extension would push the giveaway past the 30 day maximum remaining duration.", flags: 64 });

        await db.update(giveawaysTable).set({ endsAt: newEndsAt }).where(eq(giveawaysTable.id, row.id));

        const channel = await interaction.client.channels.fetch(row.channelId).catch(() => null);
        if (channel) {
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) {
                const updated = { ...row, endsAt: newEndsAt };
                await message.edit({ embeds: [buildStartEmbed(updated, row.hostTag)] }).catch(() => {});
            }
        }
        scheduleGiveawayEnd(interaction.client, { ...row, endsAt: newEndsAt });
        return interaction.reply({ content: `✅ Giveaway extended! New end time: <t:${Math.floor(newEndsAt.getTime() / 1000)}:R>`, flags: 64 });
    }

    if (sub === "reroll") {
        if (!(await isPremiumGuild(guildId)))
            return interaction.reply({ embeds: [premiumDeniedEmbed("Giveaway Reroll")], flags: 64 });

        const messageId = interaction.options.getString("message_id", true).trim();
        const [row] = await db.select().from(giveawaysTable)
            .where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, true)));
        if (!row)
            return interaction.reply({ content: "❌ No ended giveaway found with that message ID.", flags: 64 });

        const channel = await interaction.client.channels.fetch(row.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
        const winners = message ? await pickGiveawayWinners(message, row) : [];
        if (winners.length === 0)
            return interaction.reply({ content: "❌ No valid entries to reroll.", flags: 64 });

        if (channel)
            await channel.send(`🎉 **Reroll!** New winner${winners.length > 1 ? "s" : ""}: ${winners.map((id) => `<@${id}>`).join(", ")}! Congrats on winning **${row.prize}**!`).catch(() => {});
        return interaction.reply({ content: `✅ Rerolled! New winners: ${winners.map((id) => `<@${id}>`).join(", ")}`, flags: 64 });
    }
}
