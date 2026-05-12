import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { db, premiumGuildsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { invalidatePremiumCache, TIER_FEATURES } from "../utils/permissions.js";

const TOPGG_URL = "https://top.gg/bot/";
const VOTE_DURATION_MS = 16 * 60 * 60 * 1000; // 16 hours

export const data = new SlashCommandBuilder()
    .setName("premium")
    .setDescription("Manage and check premium status for this server")
    .addSubcommand((sub) =>
        sub.setName("vote")
            .setDescription("Activate 16h of Premium by voting on Top.gg (server owner only)"))
    .addSubcommand((sub) =>
        sub.setName("status")
            .setDescription("Check the premium status of this server"))
    .addSubcommand((sub) =>
        sub.setName("info")
            .setDescription("See what Premium includes and how to get it"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "info")   return handleInfo(interaction);
    if (sub === "status") return handleStatus(interaction);
    if (sub === "vote")   return handleVote(interaction);
}

async function handleVote(interaction) {
    if (interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({
            content: "❌ Only the server owner can activate Premium via vote.",
            flags: 64,
        });
    }

    const botId = interaction.client.user.id;
    const voteLink = `${TOPGG_URL}${botId}/vote`;
    const token = process.env.TOPGG_TOKEN;

    if (!token) {
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🗳️ Vote to Unlock Premium")
            .setDescription(
                `Vote for Crux on Top.gg to unlock **${VOTE_DURATION_MS / 3600000} hours of Premium** for this server — free, every 12 hours.\n\n` +
                `After voting, run \`/premium vote\` again to activate.`
            )
            .addFields({ name: "🔗 Vote Link", value: `[${voteLink}](${voteLink})` })
            .setFooter({ text: "Premium renews automatically each time you vote." })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel("Vote on Top.gg").setEmoji("🗳️").setStyle(ButtonStyle.Link).setURL(voteLink),
        );
        return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    let voted = false;
    try {
        const res = await fetch(`https://top.gg/api/bots/${botId}/check?userId=${interaction.user.id}`, {
            headers: { Authorization: token },
        });
        const data = await res.json();
        voted = data.voted === 1;
    } catch {
        return interaction.editReply({ content: "❌ Couldn't reach Top.gg to verify your vote. Try again in a moment." });
    }

    if (!voted) {
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🗳️ Vote to Unlock Premium")
            .setDescription(
                `You haven't voted yet (or your vote isn't showing — Top.gg can take a minute).\n\n` +
                `Vote for Crux on Top.gg to unlock **${VOTE_DURATION_MS / 3600000} hours of Premium** for this server — free!\n\n` +
                `After voting, come back and run \`/premium vote\` again to activate it.`
            )
            .addFields({ name: "🔗 Vote Link", value: `[${voteLink}](${voteLink})` })
            .setFooter({ text: "Premium renews automatically every time you vote." })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel("Vote on Top.gg").setEmoji("🗳️").setStyle(ButtonStyle.Link).setURL(voteLink),
        );
        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    const guildId = interaction.guild.id;
    const expiresAt = new Date(Date.now() + VOTE_DURATION_MS);

    await db.insert(premiumGuildsTable).values({
        guildId,
        activatedBy: interaction.user.id,
        activatedByTag: interaction.user.tag,
        expiresAt,
        tier: "premium",
        isTrial: false,
        reminderSent: false,
        notifyUserId: interaction.user.id,
        activationMethod: "vote",
        notes: `Vote-based premium (16h) activated by ${interaction.user.tag}`,
    }).onConflictDoUpdate({
        target: premiumGuildsTable.guildId,
        set: {
            activatedBy: interaction.user.id,
            activatedByTag: interaction.user.tag,
            activatedAt: new Date(),
            expiresAt,
            tier: "premium",
            isTrial: false,
            reminderSent: false,
            notifyUserId: interaction.user.id,
            activationMethod: "vote",
            notes: `Vote-based premium (16h) activated by ${interaction.user.tag}`,
        },
    });

    invalidatePremiumCache(guildId);

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⭐ Premium Activated — 16 Hours!")
        .setDescription(
            `Thanks for voting! This server now has **Premium for 16 hours**.\n\n` +
            `All premium features — AI Assistant, AutoMod, advanced logging, and more — are now unlocked.`
        )
        .addFields(
            { name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Vote again at", value: `[Top.gg](${voteLink})`, inline: true },
        )
        .setFooter({ text: "Vote again in 12 hours to renew Premium for another 16 hours." })
        .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
}

async function handleInfo(interaction) {
    const botId = interaction.client.user.id;
    const voteLink = `${TOPGG_URL}${botId}/vote`;

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⭐ Premium — All Features, Completely Free")
        .setDescription(
            `Unlock every advanced feature by voting for Crux on **Top.gg**.\n` +
            `**One vote = 16 hours of Premium** for any server you choose. Vote every 12 hours to keep it active.`
        )
        .addFields(
            { name: "🔓 Free — Always Free", value: TIER_FEATURES.free.map((f) => `• ${f}`).join("\n") },
            { name: "⭐ Premium — Unlocked by Voting", value: TIER_FEATURES.premium.map((f) => `• ${f}`).join("\n") },
            {
                name: "🗳️ How to Get Premium",
                value:
                    `1. Vote at [Top.gg](${voteLink})\n` +
                    `2. Run \`/vote check\` to claim rewards and pick which server gets Premium\n` +
                    `3. Or run \`/premium vote\` if you're the server owner\n\n` +
                    `You can pick a **different server each time** you vote!`,
            },
        )
        .setFooter({ text: "Use /premium status to check if your server has Premium • /freetrial for a 30-day trial" })
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

async function handleStatus(interaction) {
    const guildId = interaction.guild?.id;
    if (!guildId) return interaction.reply({ content: "❌ Use this command in a server.", flags: 64 });

    const botId = interaction.client.user.id;
    const voteLink = `${TOPGG_URL}${botId}/vote`;

    const [row] = await db.select().from(premiumGuildsTable).where(eq(premiumGuildsTable.guildId, guildId));
    if (!row) {
        const embed = new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("🔓 Free Tier")
            .setDescription(
                `This server is on the **Free** tier.\n\n` +
                `Vote for Crux at [Top.gg](${voteLink}) and run \`/vote check\` or \`/premium vote\` to unlock **16 hours of Premium** for free!`
            )
            .addFields({ name: "Free Features", value: TIER_FEATURES.free.map((f) => `• ${f}`).join("\n") })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    const expired = row.expiresAt && row.expiresAt.getTime() <= Date.now();
    const displayTier = expired ? "free" : "premium";
    const method = row.activationMethod ?? "admin";

    const methodLabels = {
        vote: "🗳️ Vote-based (Top.gg)",
        trial: "🎁 Free Trial",
        admin: "⭐ Manually Granted",
    };

    const embed = new EmbedBuilder()
        .setColor(expired ? 0x95a5a6 : 0xf1c40f)
        .setTitle(`${displayTier === "premium" ? "⭐" : "🔓"} Premium Status${row.isTrial ? " (Free Trial)" : ""}`)
        .addFields(
            { name: "Status", value: expired ? "❌ Expired" : "✅ Active", inline: true },
            { name: "Activated Via", value: methodLabels[method] ?? "⭐ Manual", inline: true },
            { name: "Expires", value: row.expiresAt ? `<t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>` : "Never", inline: true },
        )
        .setTimestamp();

    if (!expired) {
        embed.addFields({ name: "What's Included", value: TIER_FEATURES.premium.map((f) => `• ${f}`).join("\n") });
    } else {
        embed.setDescription(`Your premium has expired. Vote at [Top.gg](${voteLink}) and run \`/vote check\` to get another 16 hours!`);
    }

    return interaction.reply({ embeds: [embed], flags: 64 });
}
