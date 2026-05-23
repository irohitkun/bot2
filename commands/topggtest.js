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
    .addStringOption((opt) =>
        opt.setName("mode")
            .setDescription("'ping' = connectivity check only, 'full' = simulate a real vote with rewards (default)")
            .setRequired(false)
            .addChoices(
                { name: "ping — just verify the webhook is reachable (no DB writes)", value: "ping" },
                { name: "full — simulate a real upvote and process all rewards", value: "full" },
            )
    )
    .addUserOption((opt) =>
        opt.setName("user")
            .setDescription("Who to simulate the vote for (defaults to you). Only used in full mode.")
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

    const mode = interaction.options.getString("mode") ?? "full";
    const target = interaction.options.getUser("user") ?? interaction.user;
    await interaction.deferReply({ ephemeral: true });

    const port = parseInt(process.env.PORT ?? "3000", 10);
    const secret = (process.env.TOPGG_WEBHOOK_SECRET ?? "").trim();

    if (!secret) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0xfee75c)
                .setTitle("⚠️ TOPGG_WEBHOOK_SECRET not set")
                .setDescription("Set `TOPGG_WEBHOOK_SECRET` in your `.env` to match the password in your Top.gg dashboard. Without it, anyone can trigger your webhook.")
                .setTimestamp()],
        });
        return;
    }

    // ── Build request ──────────────────────────────────────────────────────────
    const isPing = mode === "ping";
    const body = JSON.stringify(
        isPing
            ? { user: "0", type: "test" }
            : { user: target.id, type: "upvote" }
    );

    const statusCode = await new Promise((resolve, reject) => {
        const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            "Authorization": secret,
        };

        const req = httpRequest(
            { hostname: "127.0.0.1", port, path: "/topgg/webhook", method: "POST", headers },
            (res) => {
                res.resume();
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
        .setTimestamp()
        .setFooter({ text: "This is a test — no actual vote was registered on Top.gg" });

    if (isPing) {
        embed
            .setTitle(ok ? "✅ Webhook Reachable" : "❌ Webhook Unreachable")
            .setDescription(ok
                ? `The webhook endpoint responded with **200 OK**.\nTop.gg can reach your bot — connectivity is working!`
                : `Webhook POST failed: \`${statusCode}\`\n\nCheck that the HTTP server started and \`PORT\` is correct.`
            );
    } else {
        embed
            .setTitle(ok ? "✅ Full Vote Simulated" : "❌ Vote Simulation Failed")
            .setDescription(ok
                ? `Simulated a full upvote from **${target.tag}**.\n\nProcessing is async — check:\n• Bot console for \`[TopGG]\` lines\n• Your vote log channel (if configured)\n• **${target.tag}**'s DMs (bot must be able to DM them)`
                : `Webhook POST failed: \`${statusCode}\`\n\nCheck that the HTTP server started and \`PORT\` is correct.`
            )
            .addFields(
                { name: "Simulated User", value: `${target.tag} (${target.id})`, inline: true },
            );
    }

    embed.addFields(
        { name: "HTTP Status", value: String(statusCode), inline: true },
        { name: "Endpoint", value: `http://127.0.0.1:${port}/topgg/webhook`, inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
}
