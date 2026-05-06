import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
  const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1482403011144843366&permissions=8&integration_type=0&scope=bot+applications.commands";
  export const data = new SlashCommandBuilder()
      .setName("invite")
      .setDescription("Get the invite link to add the bot to your server");
  export async function execute(interaction) {
      const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("➕ Invite Me to Your Server")
          .setDescription(`[Click here to add me to your server](${INVITE_URL})`)
          .setFooter({ text: "Thanks for using the bot!" })
          .setTimestamp();
      await interaction.reply({ embeds: [embed] });
  }
  
