import OpenAI from "openai";

// ── Key pools ────────────────────────────────────────────────────────────────
// Reads GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 ... (same for OpenAI)
// Exhausted keys (out-of-credits) are skipped permanently for the process lifetime.
// Rate-limited keys (429 temporary) are retried on the next attempt.

const exhausted = new Set(); // keys that returned a credit/billing hard error

function collectKeys(prefix) {
    const keys = [];
    const base = process.env[prefix];
    if (base) keys.push(base.trim());
    for (let i = 2; i <= 10; i++) {
        const k = process.env[`${prefix}_${i}`];
        if (k) keys.push(k.trim());
    }
    return keys.filter(Boolean);
}

function getProviderName() {
    const selected = process.env.AI_PROVIDER?.trim().toLowerCase();
    if (selected) return selected;
    if (collectKeys("GROQ_API_KEY").length > 0) return "groq";
    if (collectKeys("OPENAI_API_KEY").length > 0 || collectKeys("AI_INTEGRATIONS_OPENAI_API_KEY").length > 0) return "openai";
    return "groq";
}

function getProviderKeys() {
    const provider = getProviderName();
    if (provider === "groq") {
        return {
            provider,
            keys: collectKeys("GROQ_API_KEY"),
            baseURL: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
            model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
            missingMessage: "No AI key configured. Add GROQ_API_KEY (and optionally GROQ_API_KEY_2, GROQ_API_KEY_3 for fallback).",
        };
    }
    if (provider === "openai") {
        const oaiKeys = [
            ...collectKeys("AI_INTEGRATIONS_OPENAI_API_KEY"),
            ...collectKeys("OPENAI_API_KEY"),
        ];
        return {
            provider,
            keys: oaiKeys,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL,
            model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
            missingMessage: "No OpenAI key configured. Add OPENAI_API_KEY (and optionally OPENAI_API_KEY_2, OPENAI_API_KEY_3 for fallback).",
        };
    }
    return {
        provider,
        keys: [],
        baseURL: null,
        model: null,
        missingMessage: `Unsupported AI_PROVIDER "${provider}". Use "groq" or "openai".`,
    };
}

// ── Client cache ─────────────────────────────────────────────────────────────

const clientCache = new Map();

function getClient(apiKey, baseURL) {
    const cacheKey = `${apiKey}:${baseURL ?? "default"}`;
    let client = clientCache.get(cacheKey);
    if (!client) {
        client = new OpenAI({ apiKey, baseURL });
        clientCache.set(cacheKey, client);
    }
    return client;
}

// ── Credit/billing error detection ───────────────────────────────────────────

function isCreditExhausted(err) {
    const msg = (err?.message ?? "").toLowerCase();
    const code = err?.status ?? err?.code ?? err?.error?.code ?? 0;
    // Hard billing errors — skip this key permanently
    return (
        code === 402 ||
        msg.includes("insufficient_quota") ||
        msg.includes("insufficient credits") ||
        msg.includes("credit balance") ||
        msg.includes("billing") ||
        msg.includes("quota exceeded") ||
        msg.includes("out of credits") ||
        msg.includes("payment")
    );
}

function isRateLimit(err) {
    return (err?.status ?? err?.code ?? 0) === 429;
}

// ── Public status ─────────────────────────────────────────────────────────────

export function getAIStatus() {
    const cfg = getProviderKeys();
    const available = cfg.keys.filter((k) => !exhausted.has(k));
    const ready = available.length > 0 && !!cfg.model;
    return {
        provider: cfg.provider,
        model: cfg.model,
        ready,
        totalKeys: cfg.keys.length,
        availableKeys: available.length,
        message: ready ? null : cfg.keys.length === 0 ? cfg.missingMessage : `All ${cfg.keys.length} key(s) are exhausted. Add more keys or top up credits.`,
    };
}

// ── Core completion (with key rotation) ──────────────────────────────────────

export async function createAIChatCompletion({ messages, maxTokens = 1024, responseFormat, model }) {
    const cfg = getProviderKeys();
    if (!cfg.model) throw new Error(cfg.missingMessage);

    const resolvedModel = model ?? cfg.model;
    const available = cfg.keys.filter((k) => !exhausted.has(k));
    if (available.length === 0) {
        throw new Error(cfg.keys.length === 0 ? cfg.missingMessage : "All API keys are out of credits. Add more keys or top up credits.");
    }

    let lastErr;
    for (const key of available) {
        const client = getClient(key, cfg.baseURL);
        const payload = { model: resolvedModel, max_tokens: maxTokens, messages };
        if (responseFormat) payload.response_format = responseFormat;
        try {
            return await client.chat.completions.create(payload);
        } catch (err) {
            lastErr = err;
            if (isCreditExhausted(err)) {
                exhausted.add(key);
                const keyLabel = cfg.keys.indexOf(key) + 1;
                console.warn(`[AI] Key #${keyLabel} exhausted (credit/billing error) — rotating to next key.`);
                continue;
            }
            if (isRateLimit(err)) {
                console.warn(`[AI] Key #${cfg.keys.indexOf(key) + 1} rate-limited (429) — rotating to next key.`);
                continue;
            }
            // Any other error (bad request, auth, etc.) — throw immediately
            throw err;
        }
    }
    throw lastErr ?? new Error("All API keys failed.");
}

// ── Assistant model ───────────────────────────────────────────────────────────

export function getAssistantModel() {
    const override = process.env.AI_ASSISTANT_MODEL?.trim();
    if (override) return override;
    const cfg = getProviderKeys();
    if (cfg.provider === "groq") {
        return "llama-3.3-70b-versatile";
    }
    return cfg.model;
}
