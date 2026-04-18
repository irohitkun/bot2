import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db, remindersTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
function parseDuration(input) {
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match)
        return null;
    const v = parseInt(match[1], 10);
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return v * mult[match[2].toLowerCase()];
}
export const data = new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder")
    .addStringOption((opt) => opt.setName("time").setDescription("When to remind you (e.g. 10m, 2h, 1d)").setRequired(true))
    .addStringOption((opt) => opt.setName("message").setDescription("What to remind you about").setRequired(true).setMaxLength(500));
export async function execute(interaction) {
    const timeStr = interaction.options.getString("time", true);
    const message = interaction.options.getString("message", true);
    const ms = parseDuration(timeStr);
    if (!ms)
        return interaction.reply({ content: "❌ Invalid time format. Use formats like `10m`, `2h`, `1d`.", flags: 64 });
    if (ms > 30 * 24 * 3600000)
        return interaction.reply({ content: "❌ Reminder cannot be more than 30 days.", flags: 64 });
    const remindAt = new Date(Date.now() + ms);
    await db.insert(remindersTable).values({ userId: interaction.user.id, channelId: interaction.channelId, message, remindAt });
    const embed = new EmbedBuilder().setColor(0x57f287)
        .setTitle("⏰ Reminder Set")
        .setDescription(`I'll remind you about: **${message}**\n\n⏱️ <t:${Math.floor(remindAt.getTime() / 1000)}:R>`)
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
    setTimeout(async () => {
        try {
            const channel = await interaction.client.channels.fetch(interaction.channelId).catch(() => null);
            if (!channel)
                return;
            await channel.send({ content: `⏰ <@${interaction.user.id}> **Reminder:** ${message}` });
            await db.delete(remindersTable).where(and(eq(remindersTable.userId, interaction.user.id), eq(remindersTable.message, message)));
        }
        catch { }
    }, ms);
}
