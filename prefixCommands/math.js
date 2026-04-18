function safeEval(expr) {
    const sanitized = expr.replace(/[^0-9+\-*/().% ]/g, "");
    if (!sanitized.trim())
        throw new Error("Invalid");
    return Function(`"use strict"; return (${sanitized})`)();
}
export const command = {
    name: "math",
    usage: "%math <expression>",
    description: "Evaluate a math expression",
    async execute(message, args) {
        if (!args.length)
            return void message.reply(`Usage: \`${this.usage}\``);
        const expression = args.join(" ");
        try {
            const result = safeEval(expression);
            if (!isFinite(result))
                return void message.reply("❌ Result is not a finite number.");
            await message.reply(`🧮 \`${expression}\` = **${result}**`);
        }
        catch {
            await message.reply("❌ Invalid expression.");
        }
    },
};
