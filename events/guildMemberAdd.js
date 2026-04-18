import { Events, EmbedBuilder } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getGuildStyle } from "../utils/guildStyle.js";
export const name = Events.GuildMemberAdd;
export const once = false;
export async function execute(member) {
    const guildId = member.guild.id;
    const [config] = await db.select().from(serverCustomizationTable).where(eq(serverCustomizationTable.guildId, guildId));
    const style = await getGuildStyle(guildId);
    const channelId = config?.welcomeChannelId ?? member.guild.systemChannelId;
    if (!channelId)
        return;
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel)
        return;
    const defaultMsg = "👋 Welcome to **{server}**, {user}! You are member **#{count}**.";
    const template = config?.welcomeMessage ?? defaultMsg;
    const welcomeText = template
        .replace(/\{user\}/gi, member.toString())
        .replace(/\{server\}/gi, member.guild.name)
        .replace(/\{count\}/gi, `${member.guild.memberCount}`);
    const embed = new EmbedBuilder()
        .setColor(style.color)
        .setTitle("👋 Welcome!")
        .setDescription(welcomeText)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter(style.footer ? { text: style.footer } : { text: member.guild.name })
        .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => { });
}
