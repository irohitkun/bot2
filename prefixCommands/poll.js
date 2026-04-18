const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
export const command = {
    name: "poll",
    usage: "%poll <question> | <option1> | <option2> ...",
    description: "Create a poll",
    async execute(message, args) {
        const full = args.join(" ");
        const parts = full.split("|").map((p) => p.trim()).filter(Boolean);
        if (parts.length < 3)
            return void message.reply(`Usage: \`%poll My question | Option A | Option B\``);
        const [question, ...options] = parts;
        if (options.length > 10)
            return void message.reply("❌ Maximum 10 options.");
        const description = options.map((opt, i) => `${NUMBERS[i]} ${opt}`).join("\n");
        const msg = await message.channel.send(`📊 **${question}**\n${description}`);
        for (let i = 0; i < options.length; i++)
            await msg.react(NUMBERS[i]).catch(() => { });
        await message.delete().catch(() => { });
    },
};
