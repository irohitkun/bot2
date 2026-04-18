import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db, serverCustomizationTable } from "../db/index.js";
import { invalidateStyleCache, getGuildStyle } from "../utils/guildStyle.js";
export const data = new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure the welcome message system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("set").setDescription("Set the welcome channel and message")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to send welcome messages in").setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("Welcome message. Use {user}, {server}, {count}").setRequired(false).setMaxLength(500)))
    .addSubcommand((sub) => sub.setName("test").setDescription("Send a test welcome message"))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable welcome messages"));
export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        const message = interaction.options.getString("message") ?? "👋 Welcome to **{server}**, {user}! You are member **#{count}**.";
        await db.insert(serverCustomizationTable).values({ guildId, welcomeChannelId: channel.id, welcomeMessage: message })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { welcomeChannelId: channel.id, welcomeMessage: message, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({ content: `✅ Welcome messages will be sent to <#${channel.id}>.\nMessage preview:\n> ${message}`, flags: 64 });
    }
    if (sub === "test") {
        const [config] = await db.select().from(serverCustomizationTable).where((await import("drizzle-orm")).eq(serverCustomizationTable.guildId, guildId));
        if (!config?.welcomeChannelId)
            return interaction.reply({ content: "❌ No welcome channel configured. Use `/welcome set` first.", flags: 64 });
        const channel = interaction.guild.channels.cache.get(config.welcomeChannelId);
        if (!channel)
            return interaction.reply({ content: "❌ Welcome channel not found.", flags: 64 });
        const style = await getGuildStyle(guildId);
        const member = interaction.guild.members.me;
        const template = config.welcomeMessage ?? "👋 Welcome to **{server}**, {user}! You are member **#{count}**.";
        const text = template.replace(/\{user\}/gi, member.toString()).replace(/\{server\}/gi, interaction.guild.name).replace(/\{count\}/gi, `${interaction.guild.memberCount}`);
        const embed = new EmbedBuilder().setColor(style.color).setTitle("👋 Welcome!").setDescription(text)
            .setThumbnail(member.user.displayAvatarURL({ size: 256 })).setFooter(style.footer ? { text: style.footer } : { text: interaction.guild.name }).setTimestamp();
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: `✅ Test welcome message sent to ${channel}.`, flags: 64 });
    }
    if (sub === "disable") {
        await db.insert(serverCustomizationTable).values({ guildId })
            .onConflictDoUpdate({ target: serverCustomizationTable.guildId, set: { welcomeChannelId: null, welcomeMessage: null, updatedAt: new Date() } });
        invalidateStyleCache(guildId);
        return interaction.reply({ content: "✅ Welcome messages have been disabled.", flags: 64 });
    }
}
