import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, birthdaysTable, birthdaySettingsTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
import { isPremium } from "../utils/permissions.js";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_IN_MONTH = [31,29,31,30,31,30,31,31,30,31,30,31]; // Feb allows 29 for leap year safety

export const data = new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Birthday system — register birthdays and get celebrated")
    .addSubcommand((sub) =>
        sub.setName("set")
            .setDescription("Register your birthday")
            .addIntegerOption((o) => o.setName("month").setDescription("Month (1–12)").setRequired(true).setMinValue(1).setMaxValue(12))
            .addIntegerOption((o) => o.setName("day").setDescription("Day of the month").setRequired(true).setMinValue(1).setMaxValue(31)))
    .addSubcommand((sub) =>
        sub.setName("remove")
            .setDescription("Remove your birthday from this server"))
    .addSubcommand((sub) =>
        sub.setName("view")
            .setDescription("View a member's birthday")
            .addUserOption((o) => o.setName("user").setDescription("User (defaults to yourself)").setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("today")
            .setDescription("See who has a birthday today"))
    .addSubcommand((sub) =>
        sub.setName("upcoming")
            .setDescription("Show upcoming birthdays in the next 30 days"))
    .addSubcommand((sub) =>
        sub.setName("setup")
            .setDescription("(Premium) Configure birthday announcements for this server")
            .addChannelOption((o) => o.setName("channel").setDescription("Channel to post birthday announcements in").setRequired(true))
            .addRoleOption((o) => o.setName("role").setDescription("Optional: role to give the birthday person for the day").setRequired(false))
            .addStringOption((o) => o.setName("message").setDescription('Custom message. Use {user} for mention. Default: "🎂 Happy Birthday {user}! 🎉"').setRequired(false)))
    .addSubcommand((sub) =>
        sub.setName("disable")
            .setDescription("(Premium) Disable birthday announcements"));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "set")      return handleSet(interaction);
    if (sub === "remove")   return handleRemove(interaction);
    if (sub === "view")     return handleView(interaction);
    if (sub === "today")    return handleToday(interaction);
    if (sub === "upcoming") return handleUpcoming(interaction);
    if (sub === "setup")    return handleSetup(interaction);
    if (sub === "disable")  return handleDisable(interaction);
}

async function handleSet(interaction) {
    const month = interaction.options.getInteger("month", true);
    const day = interaction.options.getInteger("day", true);
    const { color } = await getGuildStyle(interaction.guild.id);

    if (day > DAYS_IN_MONTH[month - 1]) {
        return interaction.reply({ content: `❌ ${MONTHS[month - 1]} doesn't have ${day} days.`, flags: 64 });
    }

    await db.insert(birthdaysTable).values({
        userId: interaction.user.id, guildId: interaction.guild.id, month, day,
    }).onConflictDoUpdate({
        target: [birthdaysTable.userId, birthdaysTable.guildId],
        set: { month, day },
    });

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("🎂 Birthday Saved!")
            .setDescription(`Your birthday has been set to **${MONTHS[month - 1]} ${day}** in this server.\nYou'll be celebrated when the day comes! 🎉`)],
        flags: 64,
    });
}

async function handleRemove(interaction) {
    const result = await db.delete(birthdaysTable)
        .where(and(eq(birthdaysTable.userId, interaction.user.id), eq(birthdaysTable.guildId, interaction.guild.id)))
        .returning();
    if (result.length === 0) return interaction.reply({ content: "❌ You haven't registered a birthday in this server.", flags: 64 });
    return interaction.reply({ content: "✅ Your birthday has been removed from this server.", flags: 64 });
}

async function handleView(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const { color } = await getGuildStyle(interaction.guild.id);
    const [bd] = await db.select().from(birthdaysTable)
        .where(and(eq(birthdaysTable.userId, target.id), eq(birthdaysTable.guildId, interaction.guild.id)));

    if (!bd) return interaction.reply({ content: `❌ ${target.id === interaction.user.id ? "You haven't" : `**${target.username}** hasn't`} registered a birthday in this server.`, flags: 64 });

    const now = new Date();
    const thisYear = now.getUTCFullYear();
    let nextBday = new Date(Date.UTC(thisYear, bd.month - 1, bd.day));
    if (nextBday < now) nextBday = new Date(Date.UTC(thisYear + 1, bd.month - 1, bd.day));

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`🎂 ${target.username}'s Birthday`)
            .addFields(
                { name: "Date", value: `**${MONTHS[bd.month - 1]} ${bd.day}**`, inline: true },
                { name: "Coming up", value: `<t:${Math.floor(nextBday.getTime() / 1000)}:R>`, inline: true },
            )
            .setThumbnail(target.displayAvatarURL())],
        flags: 64,
    });
}

async function handleToday(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    const birthdays = await db.select().from(birthdaysTable)
        .where(and(eq(birthdaysTable.guildId, interaction.guild.id), eq(birthdaysTable.month, month), eq(birthdaysTable.day, day)));

    if (birthdays.length === 0) {
        return interaction.reply({ content: `No birthdays today (${MONTHS[month - 1]} ${day}). 🎂`, flags: 64 });
    }

    const mentions = birthdays.map((b) => `<@${b.userId}>`).join(", ");
    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`🎂 Birthdays Today — ${MONTHS[month - 1]} ${day}`)
            .setDescription(`🎉 Happy Birthday to: ${mentions}`)],
    });
}

async function handleUpcoming(interaction) {
    const { color } = await getGuildStyle(interaction.guild.id);
    const allBdays = await db.select().from(birthdaysTable)
        .where(eq(birthdaysTable.guildId, interaction.guild.id));

    if (allBdays.length === 0) return interaction.reply({ content: "No birthdays registered in this server yet.", flags: 64 });

    const now = new Date();
    const nowTs = now.getTime();
    const thisYear = now.getUTCFullYear();

    const withDates = allBdays.map((b) => {
        let next = new Date(Date.UTC(thisYear, b.month - 1, b.day));
        if (next.getTime() < nowTs) next = new Date(Date.UTC(thisYear + 1, b.month - 1, b.day));
        return { ...b, nextTs: next.getTime(), next };
    }).filter((b) => b.nextTs - nowTs <= 30 * 24 * 60 * 60 * 1000)
      .sort((a, z) => a.nextTs - z.nextTs);

    if (withDates.length === 0) return interaction.reply({ content: "No birthdays in the next 30 days.", flags: 64 });

    const lines = withDates.map((b) =>
        `<@${b.userId}> — **${MONTHS[b.month - 1]} ${b.day}** (<t:${Math.floor(b.nextTs / 1000)}:R>)`
    );
    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("🎂 Upcoming Birthdays (30 days)")
            .setDescription(lines.join("\n").slice(0, 4000))],
        flags: 64,
    });
}

async function handleSetup(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ You need **Manage Server** permission.", flags: 64 });
    }
    if (!await isPremium(interaction.guild.id)) {
        return interaction.reply({ content: "⭐ Birthday announcements are a **premium** feature. Upgrade to enable them.", flags: 64 });
    }
    const channel = interaction.options.getChannel("channel", true);
    const role = interaction.options.getRole("role");
    const message = interaction.options.getString("message") ?? "🎂 Happy Birthday {user}! 🎉";
    const { color } = await getGuildStyle(interaction.guild.id);

    await db.insert(birthdaySettingsTable).values({
        guildId: interaction.guild.id,
        channelId: channel.id,
        roleId: role?.id ?? null,
        message,
        enabled: true,
    }).onConflictDoUpdate({
        target: [birthdaySettingsTable.guildId],
        set: { channelId: channel.id, roleId: role?.id ?? null, message, enabled: true },
    });

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("🎂 Birthday Announcements Set Up!")
            .addFields(
                { name: "Channel", value: channel.toString(), inline: true },
                { name: "Birthday Role", value: role ? role.toString() : "None", inline: true },
                { name: "Message Template", value: message },
            )
            .setFooter({ text: "Use {user} in your message to mention the birthday person" })],
        flags: 64,
    });
}

async function handleDisable(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ You need **Manage Server** permission.", flags: 64 });
    }
    const result = await db.update(birthdaySettingsTable).set({ enabled: false })
        .where(eq(birthdaySettingsTable.guildId, interaction.guild.id)).returning();
    if (result.length === 0) return interaction.reply({ content: "❌ Birthday announcements were not configured.", flags: 64 });
    return interaction.reply({ content: "✅ Birthday announcements disabled.", flags: 64 });
}
