export const command = {
    name: "dice",
    usage: "%dice [sides] [count]",
    description: "Roll a dice",
    async execute(message, args) {
        const sides = Math.min(1000, Math.max(2, parseInt(args[0] ?? "6") || 6));
        const count = Math.min(10, Math.max(1, parseInt(args[1] ?? "1") || 1));
        const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
        const total = rolls.reduce((a, b) => a + b, 0);
        await message.reply(`🎲 **${count}d${sides}:** ${rolls.map((r) => `**${r}**`).join(", ")} (Total: **${total}**)`);
    },
};
