import { EmbedBuilder } from "discord.js";
import { db, giveawaysTable } from "../db/index.js";
import { eq } from "drizzle-orm";

const MAX_TIMEOUT_MS = 2_147_483_647;

export function safeSetTimeout(fn, delay) {
    if (delay > MAX_TIMEOUT_MS) {
        return setTimeout(() => safeSetTimeout(fn, delay - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
    }
    return setTimeout(fn, Math.max(0, delay));
}

function parseCsvIds(csv) {
    if (!csv) return [];
    return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

// Determine eligibility and entry weight for a single guild member based on
// the giveaway's requirements. Returns 0 to disqualify, otherwise the number
// of entries this user contributes.
function entryWeightForMember(member, user, row) {
    if (!member) return 0;

    if (row.requiredRoleId && !member.roles.cache.has(row.requiredRoleId)) {
        return 0;
    }

    if (row.minAccountAgeDays && row.minAccountAgeDays > 0) {
        const ageMs = Date.now() - user.createdAt.getTime();
        const minMs = row.minAccountAgeDays * 24 * 60 * 60 * 1000;
        if (ageMs < minMs) return 0;
    }

    let weight = 1;
    const bonusRoles = parseCsvIds(row.bonusRoleIds);
    const bonusEntries = row.bonusEntries ?? 0;
    if (bonusRoles.length > 0 && bonusEntries > 0) {
        const hasBonus = bonusRoles.some((rid) => member.roles.cache.has(rid));
        if (hasBonus) weight += bonusEntries;
    }
    return weight;
}

// Pick winners from the 🎉 reactors, honoring eligibility and bonus entries.
export async function pickGiveawayWinners(message, row) {
    const reaction = message.reactions.cache.get("🎉");
    if (!reaction) return [];
    const users = await reaction.users.fetch();
    const guild = message.guild;
    if (!guild) return [];

    // Build a weighted pool: each eligible user appears `weight` times.
    const pool = [];
    const seen = new Set();
    for (const user of users.values()) {
        if (user.bot || seen.has(user.id)) continue;
        if (user.id === row.hostId) continue; // host cannot win their own giveaway
        seen.add(user.id);
        const member = await guild.members.fetch(user.id).catch(() => null);
        const weight = entryWeightForMember(member, user, row);
        for (let i = 0; i < weight; i++) pool.push(user.id);
    }

    if (pool.length === 0) return [];

    // Pick `winnersCount` distinct winners from the weighted pool.
    const winners = [];
    const wantedCount = Math.min(row.winnersCount, seen.size);
    while (winners.length < wantedCount && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        const pick = pool[idx];
        winners.push(pick);
        // Remove every entry for this user so they cannot win twice.
        for (let i = pool.length - 1; i >= 0; i--) {
            if (pool[i] === pick) pool.splice(i, 1);
        }
    }
    return winners;
}

export async function endGiveaway(client, row) {
    try {
        const [current] = await db
            .select()
            .from(giveawaysTable)
            .where(eq(giveawaysTable.id, row.id));
        if (!current || current.ended) return;

        // If endsAt has been pushed into the future (e.g. by extend), reschedule.
        const remaining = current.endsAt.getTime() - Date.now();
        if (remaining > 0) {
            safeSetTimeout(() => endGiveaway(client, current), remaining);
            return;
        }

        const channel = await client.channels.fetch(current.channelId).catch(() => null);
        const message = channel
            ? await channel.messages.fetch(current.messageId).catch(() => null)
            : null;

        let winners = [];
        if (message) winners = await pickGiveawayWinners(message, current);

        await db
            .update(giveawaysTable)
            .set({ ended: true, winners: winners.join(",") })
            .where(eq(giveawaysTable.id, current.id));

        if (message) {
            const endEmbed = new EmbedBuilder()
                .setColor(winners.length > 0 ? 0x57f287 : 0xed4245)
                .setTitle("🎉 Giveaway Ended!")
                .setDescription(
                    winners.length > 0
                        ? `**Prize:** ${current.prize}\n**Winner${winners.length > 1 ? "s" : ""}:** ${winners.map((id) => `<@${id}>`).join(", ")}`
                        : `**Prize:** ${current.prize}\n\nNo valid entries!`,
                )
                .setTimestamp();
            await message.edit({ embeds: [endEmbed] }).catch(() => {});
            if (winners.length > 0 && channel) {
                await channel
                    .send(`🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${current.prize}**!`)
                    .catch(() => {});
            }
        }

        console.log(`[Giveaways] Ended giveaway ${current.id} (${current.prize})`);
    } catch (err) {
        console.error(`[Giveaways] Error ending giveaway ${row.id}:`, err);
    }
}

export function scheduleGiveawayEnd(client, row) {
    const delay = row.endsAt.getTime() - Date.now();
    if (delay <= 0) {
        endGiveaway(client, row);
    } else {
        safeSetTimeout(() => endGiveaway(client, row), delay);
    }
}

// Build the giveaway requirements footer block (used by start, list, extend).
export function buildRequirementsBlock(row) {
    const lines = [];
    if (row.requiredRoleId) lines.push(`• Required role: <@&${row.requiredRoleId}>`);
    if (row.minAccountAgeDays && row.minAccountAgeDays > 0) {
        lines.push(`• Min account age: **${row.minAccountAgeDays}d**`);
    }
    const bonusRoles = parseCsvIds(row.bonusRoleIds);
    if (bonusRoles.length > 0 && row.bonusEntries > 0) {
        lines.push(
            `• Bonus entries: ${bonusRoles.map((id) => `<@&${id}>`).join(", ")} get **+${row.bonusEntries}** extra entries`,
        );
    }
    return lines.length > 0 ? `\n\n**Requirements:**\n${lines.join("\n")}` : "";
}
