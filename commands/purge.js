import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages in the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) => opt
    .setName("amount")
    .setDescription("Number of messages to delete (1–100)")
    .setMinValue(1)
    .setMaxValue(100)
    .setRequired(true))
    .addUserOption((opt) => opt.setName("user").setDescription("Only delete messages from this user").setRequired(false));
export async function execute(interaction) {
    const amount = interaction.options.getInteger("amount", true);
    const filterUser = interaction.options.getUser("user");
    const channel = interaction.channel;
    await interaction.deferReply({ flags: 64 });
    const fetched = await channel.messages.fetch({ limit: amount });
    let toDelete = [...fetched.values()];
    if (filterUser) {
        toDelete = toDelete.filter((m) => m.author.id === filterUser.id);
    }
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    toDelete = toDelete.filter((m) => m.createdTimestamp > twoWeeksAgo);
    if (toDelete.length === 0) {
        return interaction.editReply("No eligible messages found to delete.");
    }
    const deleted = await channel.bulkDelete(toDelete, true);
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🗑️ Messages Purged")
        .addFields({ name: "Deleted", value: `${deleted.size} message(s)`, inline: true }, { name: "Channel", value: channel.toString(), inline: true }, { name: "Moderator", value: interaction.user.tag, inline: true })
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
