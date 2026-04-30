import OpenAI from "openai";

const clients = new Map();

function getProviderName() {
    const selected = process.env.AI_PROVIDER?.trim().toLowerCase();
    if (selected) {
        return selected;
    }
    if (process.env.GROQ_API_KEY) {
        return "groq";
    }
    if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
        return "openai";
    }
    return "groq";
}

function getProviderConfig() {
    const provider = getProviderName();
    if (provider === "groq") {
        return {
            provider,
            apiKey: process.env.GROQ_API_KEY,
            baseURL: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
            model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
        missingMessage: "No AI key is configured. Add GROQ_API_KEY for Groq, or add an OpenAI key.",
        };
    }
    if (provider === "openai") {
        return {
            provider,
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL,
            model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        missingMessage: "No OpenAI key is configured. Add AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.",
        };
    }
    return {
        provider,
        apiKey: null,
        baseURL: null,
        model: null,
        missingMessage: `Unsupported AI_PROVIDER "${provider}". Use "groq", "openai", or leave AI_PROVIDER blank for automatic selection.`,
    };
}

export function getAIStatus() {
    const config = getProviderConfig();
    return {
        provider: config.provider,
        model: config.model,
        ready: !!config.apiKey && !!config.model,
        message: config.apiKey && config.model ? null : config.missingMessage,
    };
}

export async function createAIChatCompletion({ messages, maxTokens = 1024, responseFormat, model }) {
    const config = getProviderConfig();
    if (!config.apiKey || !config.model) {
        throw new Error(config.missingMessage);
    }
    const cacheKey = `${config.provider}:${config.baseURL ?? "default"}`;
    let client = clients.get(cacheKey);
    if (!client) {
        client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
        });
        clients.set(cacheKey, client);
    }
    const payload = {
        model: model ?? config.model,
        max_tokens: maxTokens,
        messages,
    };
    if (responseFormat) {
        payload.response_format = responseFormat;
    }
    return client.chat.completions.create(payload);
}

/**
 * Returns a model id that's better suited to structured JSON planning.
 * Falls back to the provider's default model if no override is set.
 */
export function getAssistantModel() {
    const override = process.env.AI_ASSISTANT_MODEL?.trim();
    if (override) return override;
    const config = getProviderConfig();
    if (config.provider === "groq") {
        // llama-3.3-70b-versatile is far better at structured JSON planning than 8b-instant.
        return "llama-3.3-70b-versatile";
    }
    return config.model;
}