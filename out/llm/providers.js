"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviders = getProviders;
const OPENAI_HEADERS = {
    'Content-Type': 'application/json'
};
function ensureFetch() {
    if (typeof fetch === 'undefined') {
        throw new Error('Global fetch is not available in this environment.');
    }
    return fetch;
}
async function postJson(url, headers, body) {
    const doFetch = ensureFetch();
    const response = await doFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Provider request failed: ${response.status} ${text}`);
    }
    return response.json();
}
async function openAiCompatibleChat(url, settings, messages, extraHeaders = {}) {
    const payload = {
        model: settings.model,
        messages,
        temperature: 0.2
    };
    const response = await postJson(url, {
        ...OPENAI_HEADERS,
        Authorization: `Bearer ${settings.apiKey}`,
        ...extraHeaders
    }, payload);
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('Provider response did not contain content.');
    }
    return content;
}
async function geminiChat(settings, messages) {
    const contents = messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
    const response = await postJson(url, OPENAI_HEADERS, {
        contents
    });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('Gemini response did not contain content.');
    }
    return text;
}
function getProviders() {
    return [
        {
            id: 'groq',
            label: 'Groq',
            isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
            sendChat: (messages, settings) => openAiCompatibleChat('https://api.groq.com/openai/v1/chat/completions', settings, messages)
        },
        {
            id: 'together',
            label: 'Together',
            isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
            sendChat: (messages, settings) => openAiCompatibleChat('https://api.together.xyz/v1/chat/completions', settings, messages)
        },
        {
            id: 'openRouter',
            label: 'OpenRouter',
            isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
            sendChat: (messages, settings) => openAiCompatibleChat('https://openrouter.ai/api/v1/chat/completions', settings, messages)
        },
        {
            id: 'huggingFace',
            label: 'Hugging Face',
            isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
            sendChat: (messages, settings) => openAiCompatibleChat('https://api-inference.huggingface.co/v1/chat/completions', settings, messages)
        },
        {
            id: 'gemini',
            label: 'Gemini',
            isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
            sendChat: (messages, settings) => geminiChat(settings, messages)
        }
    ];
}
//# sourceMappingURL=providers.js.map