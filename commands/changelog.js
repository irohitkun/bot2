import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { CHANGELOG, LATEST } from "../data/changelog.js";
import { getGuildStyle } from "../utils/guildStyle.js";

export const data = new SlashCommandBuilder()
    .setName("changelog")
    .setDescription("View the bot's version history and what's new")
    .addSubcommand((sub) => sub
        .setName("latest")
        .setDescription("Show what's new in the current version"))
    .addSubcommand((sub) => sub
        .setName("announce")
        .setDescription("Post the latest changelog as an announcement to a channel")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to post the announcement in (defaults to current)").setRequired(false)))
    .addSubcommand((sub) => sub
        .setName("list")
        .setDescription("Show all past versions at a glance"))
    .addSubcommand((sub) => sub
        .setName("version")
        .setDescription("Show details for a specific version")
        .addStringOption((o) => o.setName("ver").setDescription("Version number e.g. 2.1").setRequired(true)));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "latest") {
        const embed = buildChangelogEmbed(LATEST);
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "announce") {
        const channel = interaction.options.getChannel("channel") ?? interaction.channel;
        if (!channel?.isTextBased?.()) {
            return interaction.reply({ content: "❌ That channel can't receive messages.", flags: 64 });
        }
        const embed = buildChangelogEmbed(LATEST, interaction.user.tag);
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: `✅ Changelog for **v${LATEST.version}** posted in ${channel}.`, flags: 64 });
    }

    if (sub === "list") {
        const { color } = await getGuildStyle(interaction.guild.id);
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle("📋 All Bot Versions")
            .setDescription(
                CHANGELOG.map((v, i) =>
                    `${i === 0 ? "**→** " : "    "}\`v${v.version}\` — **${v.title}** *(${v.date})*`
                ).join("\n")
            )
            .setFooter({ text: `Current version: v${LATEST.version} • /changelog version <ver> for details` })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === "version") {
        const ver = interaction.options.getString("ver", true).trim().toLowerCase().replace(/^v/, "");
        const entry = CHANGELOG.find((v) => v.version === ver);
        if (!entry) {
            const available = CHANGELOG.map((v) => `v${v.version}`).join(", ");
            return interaction.reply({ content: `❌ Version \`v${ver}\` not found. Available: ${available}`, flags: 64 });
        }
        return interaction.reply({ embeds: [buildChangelogEmbed(entry)], flags: 64 });
    }
}

/** Build a richly formatted changelog embed from a version entry */
export function buildChangelogEmbed(entry, announcedBy = null) {
    const sectionEmojis = {
        added:   "✅",
        changed: "🔄",
        fixed:   "🔧",
        removed: "❌",
    };
    const sectionLabels = {
        added:   "What's New",
        changed: "Changes",
        fixed:   "Bug Fixes",
        removed: "Removed",
    };

    const embed = new EmbedBuilder()
        .setColor(entry.color ?? 0x57f287)
        .setTitle(`🚀 Version ${entry.version} — ${entry.title}`)
        .setTimestamp(new Date(entry.date));

    for (const [key, label] of Object.entries(sectionLabels)) {
        const items = entry.sections?.[key];
        if (!items?.length) continue;
        embed.addFields({
            name: `${sectionEmojis[key]} ${label}`,
            value: items.map((item) => `• ${item}`).join("\n").slice(0, 1024),
        });
    }

    const footer = announcedBy
        ? `v${entry.version} • Released ${entry.date} • Announced by ${announcedBy}`
        : `v${entry.version} • Released ${entry.date}`;
    embed.setFooter({ text: footer });

    return embed;
}
