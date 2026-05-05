import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db, customCommandsTable } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";
import { isPremium } from "../utils/permissions.js";

export const command = {
    name: "customcmd",
    usage: "%customcmd add <name> <response> | %customcmd delete <name> | %customcmd list",
    description: "Manage custom commands (premium)",
    async execute(message, args) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return void message.reply("❌ You need **Manage Messages** permission.");
        }
        if (!await isPremium(message.guild.id)) {
            return void message.reply("⭐ Custom commands are a premium feature.");
        }

        const sub = args[0]?.toLowerCase();

        if (sub === "list") {
            const cmds = await db.select().from(customCommandsTable)
                .where(eq(customCommandsTable.guildId, message.guild.id))
                .orderBy(desc(customCommandsTable.uses));
            if (cmds.length === 0) return void message.reply("No custom commands yet. Use `%customcmd add <name> <response>`.");
            const lines = cmds.map((c) => `\`${c.name}\` (${c.uses} uses)`);
            return void message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`⚙️ Custom Commands (${cmds.length})`).setDescription(lines.join("\n").slice(0, 4000))] });
        }

        if (sub === "add") {
            const name = args[1]?.toLowerCase().trim();
            if (!name) return void message.reply("Usage: `%customcmd add <name> <response>`");
            const response = args.slice(2).join(" ");
            if (!response) return void message.reply("❌ Please provide a response.");
            if (response.length > 2000) return void message.reply("❌ Response must be under 2000 characters.");
            const existing = await db.select().from(customCommandsTable).where(and(eq(customCommandsTable.guildId, message.guild.id), eq(customCommandsTable.name, name)));
            if (existing.length > 0) return void message.reply(`❌ Command \`${name}\` already exists.`);
            await db.insert(customCommandsTable).values({ guildId: message.guild.id, name, response, createdBy: message.author.id });
            return void message.reply(`✅ Custom command \`${name}\` created.`);
        }

        if (sub === "edit") {
            const name = args[1]?.toLowerCase().trim();
            if (!name) return void message.reply("Usage: `%customcmd edit <name> <response>`");
            const response = args.slice(2).join(" ");
            if (!response) return void message.reply("❌ Please provide a new response.");
            const result = await db.update(customCommandsTable).set({ response }).where(and(eq(customCommandsTable.guildId, message.guild.id), eq(customCommandsTable.name, name))).returning();
            if (result.length === 0) return void message.reply(`❌ No custom command named \`${name}\`.`);
            return void message.reply(`✅ Custom command \`${name}\` updated.`);
        }

        if (sub === "delete") {
            const name = args[1]?.toLowerCase().trim();
            if (!name) return void message.reply("Usage: `%customcmd delete <name>`");
            const result = await db.delete(customCommandsTable).where(and(eq(customCommandsTable.guildId, message.guild.id), eq(customCommandsTable.name, name))).returning();
            if (result.length === 0) return void message.reply(`❌ No custom command named \`${name}\`.`);
            return void message.reply(`✅ Custom command \`${name}\` deleted.`);
        }

        return void message.reply(`Usage:\n\`\`\`\n${this.usage}\n\`\`\``);
    },
};
