import { EmbedBuilder } from "discord.js";

function parseColor(input) {
    const clean = input.replace(/^#/, "").trim();
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
        const int = parseInt(clean, 16);
        const r = (int >> 16) & 0xff;
        const g = (int >> 8) & 0xff;
        const b = int & 0xff;
        return { hex: `#${clean.toUpperCase()}`, r, g, b, int };
    }
    const rgb = input.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (rgb) {
        const r = parseInt(rgb[1]);
        const g = parseInt(rgb[2]);
        const b = parseInt(rgb[3]);
        if (r > 255 || g > 255 || b > 255) return null;
        const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase();
        return { hex: `#${hex}`, r, g, b, int: parseInt(hex, 16) };
    }
    return null;
}

export const command = {
    name: "color",
    aliases: ["colour"],
    usage: "%color <hex or rgb>",
    description: "Preview a color and see its values",
    async execute(message, args) {
        if (!args.length) return void message.reply(`Usage: \`${this.usage}\` — e.g. \`%color ff5733\` or \`%color rgb(255,87,51)\``);
        const input = args.join(" ");
        const parsed = parseColor(input);
        if (!parsed) {
            return void message.reply("❌ Invalid color. Use a hex code like `ff5733` or `#ff5733`, or `rgb(255, 87, 51)`.");
        }
        const { hex, r, g, b, int } = parsed;
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const embed = new EmbedBuilder()
            .setColor(int)
            .setTitle("🎨 Color Preview")
            .setDescription("Color swatch: the embed sidebar shows your color")
            .addFields(
                { name: "Hex", value: `\`${hex}\``, inline: true },
                { name: "RGB", value: `\`rgb(${r}, ${g}, ${b})\``, inline: true },
                { name: "Decimal", value: `\`${int}\``, inline: true },
                { name: "Brightness", value: luminance > 0.5 ? "Light" : "Dark", inline: true },
            )
            .setThumbnail(`https://singlecolorimage.com/get/${hex.replace("#", "")}/100x100`)
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    },
};
