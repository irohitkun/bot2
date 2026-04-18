import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("channel")
    .setDescription("Channel management commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) => sub
    .setName("rename")
    .setDescription("Rename a channel")
    .addStringOption((o) => o.setName("name").setDescription("New channel name").setRequired(true).setMaxLength(100))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to rename (defaults to current)").setRequired(false)))
    .addSubcommand((sub) => sub
    .setName("move")
    .setDescription("Move a channel to a different category")
    .addChannelOption((o) => o
    .setName("category")
    .setDescription("Target category")
    .addChannelTypes(ChannelType.GuildCategory)
    .setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to move (defaults to current)").setRequired(false)))
    .addSubcommand((sub) => sub
    .setName("topic")
    .setDescription("Set a text channel's topic")
    .addStringOption((o) => o.setName("topic").setDescription("New topic (leave empty to clear)").setRequired(false).setMaxLength(1024))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to update (defaults to current)").setRequired(false)))
    .addSubcommand((sub) => sub
    .setName("clone")
    .setDescription("Clone a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to clone (defaults to current)").setRequired(false))
    .addStringOption((o) => o.setName("name").setDescription("Name for the cloned channel (optional)").setRequired(false)))
    .addSubcommand((sub) => sub
    .setName("create")
    .setDescription("Create a new channel")
    .addStringOption((o) => o.setName("name").setDescription("Channel name").setRequired(true).setMaxLength(100))
    .addStringOption((o) => o
    .setName("type")
    .setDescription("Channel type")
    .setRequired(false)
    .addChoices({ name: "Text", value: "text" }, { name: "Voice", value: "voice" }, { name: "Announcement", value: "announcement" }, { name: "Stage", value: "stage" }, { name: "Forum", value: "forum" }))
    .addChannelOption((o) => o
    .setName("category")
    .setDescription("Category to place the channel in")
    .addChannelTypes(ChannelType.GuildCategory)
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName("delete")
    .setDescription("Delete a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to delete").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for deletion").setRequired(false)))
    .addSubcommand((sub) => sub
    .setName("info")
    .setDescription("Show info about a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to inspect (defaults to current)").setRequired(false)));
export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const botMember = guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: "❌ I need the **Manage Channels** permission.", flags: 64 });
    }
    if (sub === "rename") {
        const name = interaction.options.getString("name", true);
        const target = (interaction.options.getChannel("channel") ?? interaction.channel);
        const oldName = target.name;
        await target.setName(name, `Renamed by ${interaction.user.tag}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("✅ Channel Renamed")
            .addFields({ name: "Channel", value: `<#${target.id}>`, inline: true }, { name: "Before", value: `\`${oldName}\``, inline: true }, { name: "After", value: `\`${name}\``, inline: true }, { name: "By", value: interaction.user.tag, inline: true })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "move") {
        const category = interaction.options.getChannel("category", true);
        const target = (interaction.options.getChannel("channel") ?? interaction.channel);
        await target.setParent(category.id, { lockPermissions: false, reason: `Moved by ${interaction.user.tag}` });
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("✅ Channel Moved")
            .addFields({ name: "Channel", value: `<#${target.id}>`, inline: true }, { name: "New Category", value: category.name, inline: true }, { name: "By", value: interaction.user.tag, inline: true })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "topic") {
        const topic = interaction.options.getString("topic") ?? null;
        const target = (interaction.options.getChannel("channel") ?? interaction.channel);
        if (target.type !== ChannelType.GuildText && target.type !== ChannelType.GuildAnnouncement) {
            return interaction.reply({ content: "❌ Can only set topics on text or announcement channels.", flags: 64 });
        }
        await target.setTopic(topic, `Topic updated by ${interaction.user.tag}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("✅ Channel Topic Updated")
            .addFields({ name: "Channel", value: `<#${target.id}>`, inline: true }, { name: "Topic", value: topic ?? "*Cleared*", inline: false })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "clone") {
        const target = (interaction.options.getChannel("channel") ?? interaction.channel);
        const name = interaction.options.getString("name") ?? `${target.name}-clone`;
        const cloned = await target.clone({ name, reason: `Cloned by ${interaction.user.tag}` });
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Channel Cloned")
            .addFields({ name: "Original", value: `<#${target.id}>`, inline: true }, { name: "Clone", value: `<#${cloned.id}>`, inline: true }, { name: "By", value: interaction.user.tag, inline: true })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "create") {
        const name = interaction.options.getString("name", true);
        const typeStr = interaction.options.getString("type") ?? "text";
        const category = interaction.options.getChannel("category");
        const typeMap = {
            text: ChannelType.GuildText,
            voice: ChannelType.GuildVoice,
            announcement: ChannelType.GuildAnnouncement,
            stage: ChannelType.GuildStageVoice,
            forum: ChannelType.GuildForum,
        };
        const channelType = typeMap[typeStr] ?? ChannelType.GuildText;
        const created = await guild.channels.create({
            name,
            type: channelType,
            parent: category?.id ?? null,
            reason: `Created by ${interaction.user.tag}`,
        });
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Channel Created")
            .addFields({ name: "Channel", value: `<#${created.id}>`, inline: true }, { name: "Type", value: typeStr.charAt(0).toUpperCase() + typeStr.slice(1), inline: true }, { name: "Category", value: category?.name ?? "None", inline: true }, { name: "By", value: interaction.user.tag, inline: true })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "delete") {
        const target = interaction.options.getChannel("channel", true);
        const reason = interaction.options.getString("reason") ?? `Deleted by ${interaction.user.tag}`;
        const name = target.name;
        await target.delete(reason);
        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🗑️ Channel Deleted")
            .addFields({ name: "Channel", value: `\`#${name}\``, inline: true }, { name: "Reason", value: reason, inline: true }, { name: "By", value: interaction.user.tag, inline: true })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    if (sub === "info") {
        const target = (interaction.options.getChannel("channel") ?? interaction.channel);
        const typeNames = {
            [ChannelType.GuildText]: "Text",
            [ChannelType.GuildVoice]: "Voice",
            [ChannelType.GuildCategory]: "Category",
            [ChannelType.GuildAnnouncement]: "Announcement",
            [ChannelType.GuildStageVoice]: "Stage",
            [ChannelType.GuildForum]: "Forum",
        };
        const typeName = typeNames[target.type] ?? "Unknown";
        const members = "members" in target ? target.members?.size : null;
        const category = target.parent;
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`📋 Channel Info — #${target.name}`)
            .addFields({ name: "ID", value: target.id, inline: true }, { name: "Type", value: typeName, inline: true }, { name: "Category", value: category?.name ?? "None", inline: true }, { name: "Position", value: `${target.position}`, inline: true }, { name: "Created", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true });
        if ("topic" in target && target.topic) {
            embed.addFields({ name: "Topic", value: target.topic, inline: false });
        }
        if (members !== null) {
            embed.addFields({ name: "Members Connected", value: `${members}`, inline: true });
        }
        embed.setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
}
