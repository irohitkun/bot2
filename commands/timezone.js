import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, userTimezonesTable } from "../db/index.js";
import { eq } from "drizzle-orm";

// Popular timezones shown in /timezone list
const COMMON_TIMEZONES = [
    { name: "UTC",                       tz: "UTC" },
    { name: "New York (EST/EDT)",         tz: "America/New_York" },
    { name: "Los Angeles (PST/PDT)",      tz: "America/Los_Angeles" },
    { name: "Chicago (CST/CDT)",          tz: "America/Chicago" },
    { name: "Denver (MST/MDT)",           tz: "America/Denver" },
    { name: "Toronto",                    tz: "America/Toronto" },
    { name: "São Paulo",                  tz: "America/Sao_Paulo" },
    { name: "London (GMT/BST)",           tz: "Europe/London" },
    { name: "Paris / Berlin (CET/CEST)", tz: "Europe/Paris" },
    { name: "Moscow (MSK)",               tz: "Europe/Moscow" },
    { name: "Dubai (GST)",                tz: "Asia/Dubai" },
    { name: "India (IST)",                tz: "Asia/Kolkata" },
    { name: "Bangladesh (BST)",           tz: "Asia/Dhaka" },
    { name: "Bangkok (ICT)",              tz: "Asia/Bangkok" },
    { name: "Singapore / KL (SGT)",       tz: "Asia/Singapore" },
    { name: "Tokyo / Seoul (JST/KST)",    tz: "Asia/Tokyo" },
    { name: "Sydney (AEST/AEDT)",         tz: "Australia/Sydney" },
    { name: "Auckland (NZST/NZDT)",       tz: "Pacific/Auckland" },
];

function isValidTimezone(tz) {
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; }
    catch { return false; }
}

function formatTime(tz) {
    try {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
        }).format(new Date());
    } catch {
        return "Unknown";
    }
}

export const data = new SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Set or look up a user's timezone")
    .addSubcommand((sub) =>
        sub.setName("set")
            .setDescription("Save your timezone so others can check your local time")
            .addStringOption((o) => o.setName("timezone").setDescription("IANA timezone name — e.g. Asia/Kolkata, America/New_York. Run /timezone list to browse.").setRequired(true)))
    .addSubcommand((sub) =>
        sub.setName("get")
            .setDescription("Check the current local time for a user")
            .addUserOption((o) => o.setName("user").setDescription("User to look up (defaults to yourself)").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("list")
            .setDescription("Browse common timezone names"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "set")  return handleSet(interaction);
    if (sub === "get")  return handleGet(interaction);
    if (sub === "list") return handleList(interaction);
}

async function handleSet(interaction) {
    const tz = interaction.options.getString("timezone", true).trim();

    if (!isValidTimezone(tz)) {
        return interaction.reply({
            content: `❌ **"${tz}"** is not a valid IANA timezone.\nExamples: \`Asia/Kolkata\`, \`America/New_York\`, \`Europe/London\`.\nRun \`/timezone list\` to browse common ones.`,
            flags: 64,
        });
    }

    await db.insert(userTimezonesTable)
        .values({ userId: interaction.user.id, timezone: tz })
        .onConflictDoUpdate({
            target: [userTimezonesTable.userId],
            set: { timezone: tz, updatedAt: new Date() },
        });

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🕐 Timezone Saved")
            .setDescription(`Your timezone is now set to **${tz}**.\nCurrent time for you: **${formatTime(tz)}**`)
            .setFooter({ text: "Others can check your time with /timezone get or /tz" })],
        flags: 64,
    });
}

async function handleGet(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const [row] = await db.select().from(userTimezonesTable).where(eq(userTimezonesTable.userId, target.id));

    if (!row) {
        const isSelf = target.id === interaction.user.id;
        return interaction.reply({
            content: isSelf
                ? "⚠️ You haven't set a timezone yet. Use `/timezone set <tz>` to save yours."
                : `⚠️ **${target.tag}** hasn't set their timezone yet.`,
            flags: 64,
        });
    }

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🕐 Local Time")
            .setDescription(`**${target.tag}**'s current local time:`)
            .addFields({ name: row.timezone, value: `\`${formatTime(row.timezone)}\`` })
            .setThumbnail(target.displayAvatarURL())
            .setFooter({ text: `Timezone: ${row.timezone}` })
            .setTimestamp()],
    });
}

async function handleList(interaction) {
    const now = new Date();
    const lines = COMMON_TIMEZONES.map(({ name, tz }) => {
        const time = new Intl.DateTimeFormat("en-US", {
            timeZone: tz, hour: "2-digit", minute: "2-digit", timeZoneName: "short",
        }).format(now);
        return `\`${tz.padEnd(30)}\` — ${name} · **${time}**`;
    });

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🌍 Common Timezones")
            .setDescription(lines.join("\n"))
            .setFooter({ text: "Use the IANA name (left column) with /timezone set" })
            .setTimestamp()],
        flags: 64,
    });
}
