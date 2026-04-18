import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db, automodSettingsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
export const data = new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure automatic moderation")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("status").setDescription("View current automod settings"))
    .addSubcommand((sub) => sub.setName("toggle").setDescription("Enable or disable automod")
    .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true)))
    .addSubcommand((sub) => sub.setName("addword").setDescription("Add a banned word")
    .addStringOption((o) => o.setName("word").setDescription("Word to ban").setRequired(true)))
    .addSubcommand((sub) => sub.setName("removeword").setDescription("Remove a banned word")
    .addStringOption((o) => o.setName("word").setDescription("Word to remove").setRequired(true)))
    .addSubcommand((sub) => sub.setName("setmentions").setDescription("Max mentions per message (0 = disabled)")
    .addIntegerOption((o) => o.setName("max").setDescription("Max mentions (0 to disable)").setMinValue(0).setMaxValue(20).setRequired(true)))
    .addSubcommand((sub) => sub.setName("setcaps").setDescription("Max caps percentage (0 = disabled)")
    .addIntegerOption((o) => o.setName("percent").setDescription("Percent 0-100 (0 to disable)").setMinValue(0).setMaxValue(100).setRequired(true)))
    .addSubcommand((sub) => sub.setName("antispam").setDescription("Toggle anti-spam (5 msgs in 5s)")
    .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true)))
    .addSubcommand((sub) => sub.setName("logchannel").setDescription("Set the automod log channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel for automod logs").setRequired(true)));
export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const [settings] = await db.select().from(automodSettingsTable).where(eq(automodSettingsTable.guildId, guildId));
    if (sub === "status") {
        const words = settings?.badWords ? settings.badWords.split(",").filter(Boolean) : [];
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🛡️ Automod Settings")
            .addFields({ name: "Status", value: settings?.enabled ? "✅ Enabled" : "❌ Disabled", inline: true }, { name: "Anti-Spam", value: settings?.antiSpamEnabled ? "✅ On" : "❌ Off", inline: true }, { name: "Max Mentions", value: settings?.maxMentions ? `${settings.maxMentions}` : "5", inline: true }, { name: "Max Caps %", value: settings?.maxCapsPercent ? `${settings.maxCapsPercent}%` : "70%", inline: true }, { name: "Banned Words", value: words.length > 0 ? words.join(", ") : "None", inline: false }, { name: "Log Channel", value: settings?.logChannelId ? `<#${settings.logChannelId}>` : "Not set", inline: true }).setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }
    if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await db.insert(automodSettingsTable).values({ guildId, enabled }).onConflictDoUpdate({ target: automodSettingsTable.guildId, set: { enabled, updatedAt: new Date() } });
        return interaction.reply({ content: `✅ Automod is now **${enabled ? "enabled" : "disabled"}**.`, flags: 64 });
    }
    if (sub === "addword") {
        const word = interaction.options.getString("word", true).toLowerCase().trim();
        const words = settings?.badWords ? settings.badWords.split(",").filter(Boolean) : [];
        if (words.includes(word))
            return interaction.reply({ content: "That word is already banned.", flags: 64 });
        words.push(word);
        await db.insert(automodSettingsTable).values({ guildId, badWords: words.join(",") }).onConflictDoUpdate({ target: automodSettingsTable.guildId, set: { badWords: words.join(","), updatedAt: new Date() } });
        return interaction.reply({ content: `✅ Added \`${word}\` to banned words. (${words.length} total)`, flags: 64 });
    }
    if (sub === "removeword") {
        const word = interaction.options.getString("word", true).toLowerCase().trim();
        const words = settings?.badWords ? settings.badWords.split(",").filter(Boolean) : [];
        const updated = words.filter((w) => w !== word);
        if (updated.length === words.length)
            return interaction.reply({ content: "That word is not in the banned list.", flags: 64 });
        await db.insert(automodSettingsTable).values({ guildId, badWords: updated.join(",") }).onConflictDoUpdate({ target: automodSettingsTable.guildId, set: { badWords: updated.join(","), updatedAt: new Date() } });
        return interaction.reply({ content: `✅ Removed \`${word}\` from banned words.`, flags: 64 });
    }
    if (sub === "setmentions") {
        const max = interaction.options.getInteger("max", true);
        await db.insert(automodSettingsTable).values({ guildId, maxMentions: max }).onConflictDoUpdate({ target: automodSettingsTable.guildId, set: { maxMentions: max, updatedAt: new Date() } });
        return interaction.reply({ content: `✅ Max mentions set to **${max === 0 ? "disabled" : max}**.`, flags: 64 });
    }
    if (sub === "setcaps") {
        const percent = interaction.options.getInteger("percent", true);
        await db.insert(automodSettingsTable).values({ guildId, maxCapsPercent: percent }).onConflictDoUpdate({ target: automodSettingsTable.guildId, set: { maxCapsPercent: percent, updatedAt: new Date() } });
        return interaction.reply({ content: `✅ Max caps set to **${percent === 0 ? "disabled" : `${percent}%`}**.`, flags: 64 });
    }
    if (sub === "antispam") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await db.insert(automodSettingsTable).values({ guildId, antiSpamEnabled: enabled }).onConflictDoUpdate({ target: automodSettingsTable.guildId, set: { antiSpamEnabled: enabled, updatedAt: new Date() } });
        return interaction.reply({ content: `✅ Anti-spam is now **${enabled ? "enabled" : "disabled"}**.`, flags: 64 });
    }
    if (sub === "logchannel") {
        const channel = interaction.options.getChannel("channel", true);
        await db.insert(automodSettingsTable).values({ guildId, logChannelId: channel.id }).onConflictDoUpdate({ target: automodSettingsTable.guildId, set: { logChannelId: channel.id, updatedAt: new Date() } });
        return interaction.reply({ content: `✅ Automod log channel set to <#${channel.id}>.`, flags: 64 });
    }
}
