/**
 * /tz — Quick shortcut for /timezone get
 * Shows the current local time for yourself or another user.
 */
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, userTimezonesTable } from "../db/index.js";
import { eq } from "drizzle-orm";

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
    .setName("tz")
    .setDescription("Quick look up — check a user's current local time")
    .addUserOption((o) => o.setName("user").setDescription("User to check (defaults to yourself)").setRequired(false));

export async function execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const [row] = await db.select().from(userTimezonesTable).where(eq(userTimezonesTable.userId, target.id));

    if (!row) {
        const isSelf = target.id === interaction.user.id;
        return interaction.reply({
            content: isSelf
                ? "⚠️ You haven't set a timezone yet. Use `/timezone set <tz>` to save yours. Run `/timezone list` to browse."
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
            .setFooter({ text: `Timezone: ${row.timezone} · Set via /timezone set` })
            .setTimestamp()],
    });
}
