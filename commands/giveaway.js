import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
import { db, giveawaysTable } from "../db/index.js";
import { eq, and } from "drizzle-orm";
function parseDuration(input) {
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match)
        return null;
    const v = parseInt(match[1], 10);
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return v * multipliers[match[2].toLowerCase()];
}
async function pickWinners(messageId, channelId, winnersCount, client) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel)
        return [];
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message)
        return [];
    const reaction = message.reactions.cache.get("🎉");
    if (!reaction)
        return [];
    const users = await reaction.users.fetch();
    const eligible = [...users.values()].filter((u) => !u.bot);
    if (eligible.length === 0)
        return [];
    return eligible.sort(() => Math.random() - 0.5).slice(0, Math.min(winnersCount, eligible.length)).map((u) => u.id);
}
export const data = new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("start").setDescription("Start a giveaway")
    .addStringOption((o) => o.setName("prize").setDescription("What are you giving away?").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("Duration e.g. 10m, 1h, 7d").setRequired(true))
    .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(20).setRequired(false))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to post in (defaults to current)").setRequired(false)))
    .addSubcommand((sub) => sub.setName("end").setDescription("End a giveaway early")
    .addStringOption((o) => o.setName("message_id").setDescription("Message ID of the giveaway").setRequired(true)))
    .addSubcommand((sub) => sub.setName("reroll").setDescription("Reroll winners for a finished giveaway")
    .addStringOption((o) => o.setName("message_id").setDescription("Message ID of the giveaway").setRequired(true)));
export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    if (sub === "start") {
        const prize = interaction.options.getString("prize", true);
        const durationStr = interaction.options.getString("duration", true);
        const winnersCount = interaction.options.getInteger("winners") ?? 1;
        const targetChannel = (interaction.options.getChannel("channel") ?? interaction.channel);
        const durationMs = parseDuration(durationStr);
        if (!durationMs)
            return interaction.reply({ content: "❌ Invalid duration. Use formats like `10m`, `1h`, `7d`.", flags: 64 });
        const endsAt = new Date(Date.now() + durationMs);
        const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("🎉 GIVEAWAY 🎉")
            .setDescription(`**Prize:** ${prize}\n\nReact with 🎉 to enter!\n\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n**Winners:** ${winnersCount}`)
            .setFooter({ text: `Hosted by ${interaction.user.tag}` }).setTimestamp(endsAt);
        const msg = await targetChannel.send({ embeds: [embed] });
        await msg.react("🎉");
        await db.insert(giveawaysTable).values({
            guildId, channelId: targetChannel.id, messageId: msg.id,
            prize, winnersCount, hostId: interaction.user.id, hostTag: interaction.user.tag, endsAt,
        });
        await interaction.reply({ content: `✅ Giveaway started in ${targetChannel}!`, flags: 64 });
        setTimeout(async () => {
            const [row] = await db.select().from(giveawaysTable).where(and(eq(giveawaysTable.messageId, msg.id), eq(giveawaysTable.ended, false)));
            if (!row)
                return;
            const winners = await pickWinners(msg.id, targetChannel.id, winnersCount, interaction.client);
            await db.update(giveawaysTable).set({ ended: true, winners: winners.join(",") }).where(eq(giveawaysTable.messageId, msg.id));
            const endEmbed = new EmbedBuilder().setColor(winners.length > 0 ? 0x57f287 : 0xed4245).setTitle("🎉 Giveaway Ended!")
                .setDescription(winners.length > 0 ? `**Prize:** ${prize}\n**Winner${winners.length > 1 ? "s" : ""}:** ${winners.map((id) => `<@${id}>`).join(", ")}` : `**Prize:** ${prize}\n\nNo valid entries!`)
                .setTimestamp();
            await msg.edit({ embeds: [endEmbed] });
            if (winners.length > 0)
                await targetChannel.send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${prize}**!`);
        }, durationMs);
        return;
    }
    if (sub === "end") {
        const messageId = interaction.options.getString("message_id", true).trim();
        const [row] = await db.select().from(giveawaysTable).where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, false)));
        if (!row)
            return interaction.reply({ content: "❌ No active giveaway found with that message ID.", flags: 64 });
        const winners = await pickWinners(messageId, row.channelId, row.winnersCount, interaction.client);
        await db.update(giveawaysTable).set({ ended: true, winners: winners.join(",") }).where(eq(giveawaysTable.messageId, messageId));
        const channel = await interaction.client.channels.fetch(row.channelId).catch(() => null);
        if (channel) {
            const msg = await channel.messages.fetch(messageId).catch(() => null);
            if (msg) {
                const endEmbed = new EmbedBuilder().setColor(winners.length > 0 ? 0x57f287 : 0xed4245).setTitle("🎉 Giveaway Ended!")
                    .setDescription(winners.length > 0 ? `**Prize:** ${row.prize}\n**Winners:** ${winners.map((id) => `<@${id}>`).join(", ")}` : `**Prize:** ${row.prize}\n\nNo valid entries!`)
                    .setTimestamp();
                await msg.edit({ embeds: [endEmbed] });
                if (winners.length > 0)
                    await channel.send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${row.prize}**!`);
            }
        }
        return interaction.reply({ content: winners.length > 0 ? `✅ Giveaway ended! Winners: ${winners.map((id) => `<@${id}>`).join(", ")}` : "✅ Giveaway ended! No valid entries.", flags: 64 });
    }
    if (sub === "reroll") {
        const messageId = interaction.options.getString("message_id", true).trim();
        const [row] = await db.select().from(giveawaysTable).where(and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.ended, true)));
        if (!row)
            return interaction.reply({ content: "❌ No ended giveaway found with that message ID.", flags: 64 });
        const winners = await pickWinners(messageId, row.channelId, row.winnersCount, interaction.client);
        if (winners.length === 0)
            return interaction.reply({ content: "❌ No valid entries to reroll.", flags: 64 });
        const channel = await interaction.client.channels.fetch(row.channelId).catch(() => null);
        if (channel)
            await channel.send(`🎉 **Reroll!** New winner${winners.length > 1 ? "s" : ""}: ${winners.map((id) => `<@${id}>`).join(", ")}! Congrats on winning **${row.prize}**!`);
        return interaction.reply({ content: `✅ Rerolled! New winners: ${winners.map((id) => `<@${id}>`).join(", ")}`, flags: 64 });
    }
}
