import { Events, EmbedBuilder } from "discord.js";
import { sendModLog } from "../utils/modLog.js";

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member) {
    try {
        const roles = member.roles.cache
            .filter((r) => r.id !== member.guild.id)
            .map((r) => r.toString())
            .join(" ") || "None";

        const joinedAt = member.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
            : "Unknown";

        await sendModLog(member.guild, new EmbedBuilder()
            .setColor(0xf47b67)
            .setTitle("📤 Member Left")
            .addFields(
                { name: "User", value: `${member.user.tag} (${member.user.id})`, inline: true },
                { name: "Joined", value: joinedAt, inline: true },
                { name: "Roles", value: roles },
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp(),
            "Event Log"
        );
    } catch (err) {
        console.warn("[GuildMemberRemove] Error:", err.message);
    }
}
