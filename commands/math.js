import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("math")
    .setDescription("Evaluate a math expression")
    .addStringOption((opt) => opt.setName("expression").setDescription("e.g. 2 + 2 * 10").setRequired(true).setMaxLength(200));
function safeEval(expr) {
    const sanitized = expr.replace(/[^0-9+\-*/().% ]/g, "");
    if (!sanitized.trim())
        throw new Error("Invalid expression");
    return Function(`"use strict"; return (${sanitized})`)();
}
export async function execute(interaction) {
    const expression = interaction.options.getString("expression", true);
    try {
        const result = safeEval(expression);
        if (!isFinite(result))
            return interaction.reply({ content: "❌ Result is not a finite number.", flags: 64 });
        const embed = new EmbedBuilder().setColor(0x5865f2)
            .setTitle("🧮 Math")
            .addFields({ name: "Expression", value: `\`${expression}\`` }, { name: "Result", value: `\`${result}\`` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
    catch {
        await interaction.reply({ content: "❌ Invalid expression. Use numbers and operators like `+`, `-`, `*`, `/`.", flags: 64 });
    }
}
