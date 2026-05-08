# Agentic Coder

Agentic Coder is a VS Code extension that provides a Cursor-like chat sidebar backed by free-tier LLM APIs. It supports chat plus file edits with diff preview and apply.

## Features

- Sidebar chat view with provider selector.
- Free-tier providers: Groq, Together, OpenRouter, Hugging Face Inference, Gemini.
- File edits previewed in a diff and applied on demand.

## Getting Started

1. Open the Agentic Coder view from the activity bar.
2. Add API keys in settings.
3. Ask for changes, then preview/apply edits.

## Extension Settings

This extension contributes the following settings:

- `agenticCoder.providers.groq.apiKey`
- `agenticCoder.providers.groq.model`
- `agenticCoder.providers.together.apiKey`
- `agenticCoder.providers.together.model`
- `agenticCoder.providers.openRouter.apiKey`
- `agenticCoder.providers.openRouter.model`
- `agenticCoder.providers.huggingFace.apiKey`
- `agenticCoder.providers.huggingFace.model`
- `agenticCoder.providers.gemini.apiKey`
- `agenticCoder.providers.gemini.model`

## Known Issues

- The edit protocol expects full file contents in the JSON response.
- Free-tier provider limits vary and may return rate limit errors.

## Release Notes

### 0.0.1

Initial MVP with chat, provider wiring, and edit preview/apply.
