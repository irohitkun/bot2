import { EmbedBuilder } from "discord.js";
import { db, voteRecordsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";

const BOT_ID = process.env.BOT_ID ?? "";

export const command = {
    name: "vote",
    description: "Vote for the bot on Top.gg and earn rewards",
    async execute(message) {
        const { color } = await getGuildStyle(message.guild.id);
        const voteUrl = `https://top.gg/bot/${BOT_ID}/vote`;
        const [record] = await db.select().from(voteRecordsTable).where(eq(voteRecordsTable.userId, message.author.id));

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle("🗳️ Vote for the Bot")
            .setURL(voteUrl)
            .setDescription(`Support the bot by voting on **Top.gg** and earn **coins + XP** rewards!\n\n👉 [Click here to vote!](${voteUrl})\n\nAfter voting, use \`/vote\` to claim your rewards automatically.`)
            .addFields(
                { name: "Vote Streak", value: record ? `🔥 ${record.voteStreak} days` : "Start now!", inline: true },
                { name: "Total Votes", value: record ? `${record.totalVotes}` : "0", inline: true },
            )
            .setFooter({ text: "Rewards: 200+ coins and 100 XP per vote" })
            .setTimestamp();
        return message.channel.send({ embeds: [embed] });
    },
};
