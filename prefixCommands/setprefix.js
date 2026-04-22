import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { setPrefix } from "../utils/prefixCache.js";
import { isPremiumGuild, premiumDeniedEmbed } from "../utils/permissions.js";
export const command = {
    name: "setprefix",
    usage: "<currentPrefix>setprefix <newPrefix>",
    description: "Change the bot prefix for this server",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return void message.reply("❌ You need the **Manage Server** permission to change the prefix.");
        }
        if (!(await isPremiumGuild(message.guild.id))) {
            return void message.reply({ embeds: [premiumDeniedEmbed("Custom Prefix")] });
        }
        if (!args[0]) {
            return void message.reply("Usage: `<prefix>setprefix <newPrefix>` — e.g. `%setprefix !`");
        }
        const newPrefix = args[0];
        if (newPrefix.length > 5) {
            return void message.reply("❌ Prefix must be 5 characters or fewer.");
        }
        const guild = message.guild;
        await setPrefix(guild.id, newPrefix);
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Prefix Updated")
            .setDescription(`The bot prefix for **${guild.name}** has been changed.`)
            .addFields({ name: "New Prefix", value: `\`${newPrefix}\``, inline: true }, { name: "Example", value: `\`${newPrefix}ban\`, \`${newPrefix}help\``, inline: true }, { name: "Changed By", value: message.author.tag, inline: true })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
