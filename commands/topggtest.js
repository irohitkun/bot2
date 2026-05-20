/**
 * /topggtest — Simulate a Top.gg upvote to test the full webhook flow.
 *
 * BOT OWNER ONLY. Only works while the bot is running (HTTP server must be up).
 *
 * TO DELETE THIS COMMAND LATER:
 *   1. Delete this file: commands/topggtest.js
 *   2. Restart the bot — loadCommands auto-discovers files, so it disappears automatically.
 *   3. The slash command registration will drop it from Discord on next restart too.
 *   No other files need to be touched.
 */

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { request as httpRequest } from "http";

export const data = new SlashCommandBuilder()
    .setName("topggtest")
    .setDescription("[Owner] Fire a fake Top.gg vote to test the full webhook + reward flow")
    .addUserOption((opt) =>
        opt.setName("user")
            .setDescription("Who to simulate the vote for (defaults to you)")
            .setRequired(false)
    );

export async function execute(interaction) {
    // ── Owner check ───────────────────────────────────────────────────────────
    const ownerIds = new Set([
        "1298631508533313536", // hardcoded fallback
        ...(process.env.BOT_OWNERS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    ]);
    if (!ownerIds.has(interaction.user.id)) {
        return interaction.reply({ content: "❌ Bot owners only.", ephemeral: true });
    }

    const target = interaction.options.getUser("user") ?? interaction.user;
    await interaction.deferReply({ ephemeral: true });

    const port = parseInt(process.env.PORT ?? "3000", 10);
    const secret = (process.env.TOPGG_WEBHOOK_SECRET ?? "").trim();

    // ── POST to local webhook endpoint ────────────────────────────────────────
    const body = JSON.stringify({ user: target.id, type: "upvote" });

    const statusCode = await new Promise((resolve, reject) => {
        const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
        };
        if (secret) headers["Authorization"] = secret;

        const req = httpRequest(
            { hostname: "127.0.0.1", port, path: "/topgg/webhook", method: "POST", headers },
            (res) => {
                res.resume(); // drain the body
                res.on("end", () => resolve(res.statusCode));
            }
        );
        req.on("error", reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error("Request timed out")); });
        req.write(body);
        req.end();
    }).catch((err) => err.message);

    const ok = statusCode === 200;

    const embed = new EmbedBuilder()
        .setColor(ok ? 0x57f287 : 0xed4245)
        .setTitle(ok ? "✅ Test Vote Fired" : "❌ Test Vote Failed")
        .setDescription(
            ok
                ? `Simulated an upvote from **${target.tag}**.\n\nThe vote is being processed async — check:\n• Your bot console logs for `[TopGG]` output\n• The vote log channel (if set)\n• Your own DMs (if the bot can reach you)`
                : `Webhook POST failed: \`${statusCode}\`\n\nMake sure the HTTP server is up and \`PORT\` matches.`
        )
        .addFields(
            { name: "Simulated User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "HTTP Status", value: String(statusCode), inline: true },
            { name: "Endpoint", value: `http://127.0.0.1:${port}/topgg/webhook`, inline: false },
        )
        .setFooter({ text: "This is a test — no actual vote was registered on Top.gg" })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
