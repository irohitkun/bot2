import { EmbedBuilder } from "discord.js";

function safeEval(expr) {
    const sanitized = expr.replace(/\s+/g, "");
    if (!/^[0-9+\-*/%.()^e,a-z]+$/i.test(sanitized)) {
        throw new Error("Invalid characters in expression");
    }
    const js = sanitized
        .replace(/\^/g, "**")
        .replace(/\bsqrt\b/g, "Math.sqrt")
        .replace(/\babs\b/g, "Math.abs")
        .replace(/\bfloor\b/g, "Math.floor")
        .replace(/\bceil\b/g, "Math.ceil")
        .replace(/\bround\b/g, "Math.round")
        .replace(/\bsin\b/g, "Math.sin")
        .replace(/\bcos\b/g, "Math.cos")
        .replace(/\btan\b/g, "Math.tan")
        .replace(/\blog\b/g, "Math.log10")
        .replace(/\bln\b/g, "Math.log")
        .replace(/\bpi\b/gi, "Math.PI")
        .replace(/\be\b/g, "Math.E")
        .replace(/\bmax\b/g, "Math.max")
        .replace(/\bmin\b/g, "Math.min")
        .replace(/\bpow\b/g, "Math.pow");
    if (/[a-zA-Z]/.test(js.replace(/Math\.(sqrt|abs|floor|ceil|round|sin|cos|tan|log10|log|PI|E|max|min|pow)\b/g, ""))) {
        throw new Error("Unknown function or variable");
    }
    const result = Function(`"use strict"; return (${js})`)();
    if (typeof result !== "number" || !isFinite(result)) throw new Error("Result is not a finite number");
    return result;
}

export const command = {
    name: "math",
    aliases: ["calc", "calculate"],
    usage: "%math <expression>",
    description: "Calculate a math expression",
    async execute(message, args) {
        if (!args.length) return void message.reply(`Usage: \`${this.usage}\` — e.g. \`%math 2+2\`, \`%math sqrt(144)\``);
        const expression = args.join(" ");
        let result;
        try {
            result = safeEval(expression);
        } catch {
            return void message.reply(`❌ Could not evaluate: \`${expression}\`\nTip: Use \`+\`, \`-\`, \`*\`, \`/\`, \`^\`, \`sqrt()\`, \`abs()\`, \`sin()\`, \`cos()\`, \`log()\`, \`pi\`, \`e\``);
        }
        const formatted = Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(10)).toString();
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🧮 Calculator")
            .addFields(
                { name: "Expression", value: `\`${expression}\``, inline: true },
                { name: "Result", value: `\`${formatted}\``, inline: true }
            )
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
