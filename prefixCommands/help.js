import { EmbedBuilder } from "discord.js";
export const command = {
    name: "help",
    usage: "%help",
    description: "Show all available prefix commands",
    async execute(message) {
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🤖 Bot Commands — % Prefix")
            .setDescription("All commands also work as slash commands (`/command`).")
            .addFields({
            name: "🔨 Moderation",
            value: [
                "`%ban @user [reason]` — Ban a member",
                "`%kick @user [reason]` — Kick a member",
                "`%mute @user <10m/1h/2d> [reason]` — Timeout a member",
                "`%unmute @user [reason]` — Remove timeout",
                "`%unban <userID> [reason]` — Unban a user",
            ].join("\n"),
        }, {
            name: "⚠️ Warnings",
            value: [
                "`%warn @user <reason>` — Warn a member",
                "`%warnings @user` — View member warnings",
                "`%clearwarn @user` — Clear all warnings",
            ].join("\n"),
        }, {
            name: "🗑️ Channel",
            value: [
                "`%purge <1-100> [@user]` — Bulk delete messages",
                "`%slowmode <seconds>` — Set slowmode (0 = off)",
                "`%lock [reason]` — Lock the channel",
                "`%unlock` — Unlock the channel",
            ].join("\n"),
        }, {
            name: "ℹ️ Info",
            value: [
                "`%userinfo [@user]` — View user info",
                "`%serverinfo` — View server info",
            ].join("\n"),
        }, {
            name: "🌐 Translation",
            value: "`%translate <language> <text>` — Translate text\nExample: `%translate spanish Hello world`",
        }, {
            name: "🔗 Other",
            value: "`%invite` — Get the bot invite link\n`%setprefix <new>` — Change the prefix",
        })
            .setFooter({ text: "Prefix: %   |   All commands require appropriate permissions" })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
