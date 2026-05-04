import { EmbedBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { sendModLog } from "../utils/modLog.js";

const activeLockdowns = new Map();

export const command = {
    name: "lockdown",
    usage: "%lockdown start [reason] | %lockdown end | %lockdown status",
    description: "Emergency server-wide lockdown",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return void message.reply("❌ You need **Manage Channels** permission.");
        }

        const sub = args[0]?.toLowerCase();
        const guild = message.guild;
        const me = guild.members.me;

        if (sub === "start") {
            if (activeLockdowns.has(guild.id)) {
                return void message.reply("⚠️ A lockdown is already active. Use `%lockdown end` first.");
            }
            const reason = args.slice(1).join(" ") || "Emergency lockdown";
            const textChannels = guild.channels.cache.filter(
                (c) => c.type === ChannelType.GuildText && c.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)
            );
            const lockedByUs = new Set();
            let locked = 0; let skipped = 0;
            for (const ch of textChannels.values()) {
                const ow = ch.permissionOverwrites.cache.get(guild.roles.everyone.id);
                if (ow?.deny?.has(PermissionFlagsBits.SendMessages)) { skipped++; continue; }
                try {
                    await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: `Lockdown — ${message.author.tag}: ${reason}` });
                    lockedByUs.add(ch.id); locked++;
                } catch { skipped++; }
            }
            activeLockdowns.set(guild.id, lockedByUs);
            const embed = new EmbedBuilder().setColor(0xed4245).setTitle("🔒 Lockdown Active")
                .addFields({ name: "Locked", value: `${locked}`, inline: true }, { name: "Skipped", value: `${skipped}`, inline: true }, { name: "Reason", value: reason }).setTimestamp();
            await message.reply({ embeds: [embed] });
            return void sendModLog(guild, new EmbedBuilder().setColor(0xed4245).setTitle("🔒 Lockdown Started")
                .addFields({ name: "Moderator", value: `${message.author.tag} (${message.author.id})` }, { name: "Locked", value: `${locked}` }, { name: "Reason", value: reason }).setTimestamp());
        }

        if (sub === "end") {
            const lockedByUs = activeLockdowns.get(guild.id);
            if (!lockedByUs || lockedByUs.size === 0) return void message.reply("❌ No active lockdown found.");
            let unlocked = 0; let failed = 0;
            for (const channelId of lockedByUs) {
                const ch = guild.channels.cache.get(channelId);
                if (!ch) { failed++; continue; }
                try { await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: `Lockdown lifted — ${message.author.tag}` }); unlocked++; } catch { failed++; }
            }
            activeLockdowns.delete(guild.id);
            const embed = new EmbedBuilder().setColor(0x57f287).setTitle("🔓 Lockdown Lifted")
                .addFields({ name: "Restored", value: `${unlocked}`, inline: true }, { name: "Failed", value: `${failed}`, inline: true }).setTimestamp();
            await message.reply({ embeds: [embed] });
            return void sendModLog(guild, new EmbedBuilder().setColor(0x57f287).setTitle("🔓 Lockdown Lifted")
                .addFields({ name: "Moderator", value: `${message.author.tag} (${message.author.id})` }, { name: "Restored", value: `${unlocked}` }).setTimestamp());
        }

        if (sub === "status") {
            const locked = activeLockdowns.get(guild.id);
            return void message.reply(locked?.size > 0
                ? `🔒 **Lockdown active** — ${locked.size} channel(s) locked. Use \`%lockdown end\` to lift.`
                : "✅ No active lockdown.");
        }

        return void message.reply(`Usage:\n\`\`\`\n${this.usage}\n\`\`\``);
    },
};
