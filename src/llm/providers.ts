export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
	role: ChatRole;
	content: string;
};

export type ProviderId = 'groq' | 'together' | 'openRouter' | 'huggingFace' | 'gemini';

export type ProviderSettings = {
	apiKey: string;
	model: string;
};

export type ProviderDefinition = {
	id: ProviderId;
	label: string;
	isConfigured: (settings: ProviderSettings) => boolean;
	sendChat: (messages: ChatMessage[], settings: ProviderSettings) => Promise<string>;
};

const OPENAI_HEADERS = {
	'Content-Type': 'application/json'
};

function ensureFetch(): typeof fetch {
	if (typeof fetch === 'undefined') {
		throw new Error('Global fetch is not available in this environment.');
	}
	return fetch;
}

async function postJson<T>(url: string, headers: Record<string, string>, body: unknown): Promise<T> {
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

	return response.json() as Promise<T>;
}

async function openAiCompatibleChat(
	url: string,
	settings: ProviderSettings,
	messages: ChatMessage[],
	extraHeaders: Record<string, string> = {}
): Promise<string> {
	type OpenAiResponse = {
		choices?: Array<{ message?: { content?: string } }>
	};

	const payload = {
		model: settings.model,
		messages,
		temperature: 0.2
	};

	const response = await postJson<OpenAiResponse>(
		url,
		{
			...OPENAI_HEADERS,
			Authorization: `Bearer ${settings.apiKey}`,
			...extraHeaders
		},
		payload
	);

	const content = response.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error('Provider response did not contain content.');
	}
	return content;
}

async function geminiChat(settings: ProviderSettings, messages: ChatMessage[]): Promise<string> {
	type GeminiResponse = {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
	};

	const contents = messages.map((message) => ({
		role: message.role === 'assistant' ? 'model' : 'user',
		parts: [{ text: message.content }]
	}));

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
	const response = await postJson<GeminiResponse>(url, OPENAI_HEADERS, {
		contents
	});

	const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!text) {
		throw new Error('Gemini response did not contain content.');
	}
	return text;
}

export function getProviders(): ProviderDefinition[] {
	return [
		{
			id: 'groq',
			label: 'Groq',
			isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
			sendChat: (messages, settings) =>
				openAiCompatibleChat('https://api.groq.com/openai/v1/chat/completions', settings, messages)
		},
		{
			id: 'together',
			label: 'Together',
			isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
			sendChat: (messages, settings) =>
				openAiCompatibleChat('https://api.together.xyz/v1/chat/completions', settings, messages)
		},
		{
			id: 'openRouter',
			label: 'OpenRouter',
			isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
			sendChat: (messages, settings) =>
				openAiCompatibleChat('https://openrouter.ai/api/v1/chat/completions', settings, messages)
		},
		{
			id: 'huggingFace',
			label: 'Hugging Face',
			isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
			sendChat: (messages, settings) =>
				openAiCompatibleChat('https://api-inference.huggingface.co/v1/chat/completions', settings, messages)
		},
		{
			id: 'gemini',
			label: 'Gemini',
			isConfigured: (settings) => Boolean(settings.apiKey && settings.model),
			sendChat: (messages, settings) => geminiChat(settings, messages)
		}
	];
}
