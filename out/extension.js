"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const providers_1 = require("./llm/providers");
const MAX_CONTEXT_CHARS = 12000;
const SYSTEM_PROMPT = [
    'You are an agentic coding assistant. Keep answers concise and actionable.',
    'Always respond with JSON only (no markdown).',
    'Use this schema:',
    '{"message":"short summary","edits":[{"path":"relative/path.ts","content":"full file contents"}],"terminal":{"command":"...","cwd":"optional/relative"}}',
    'If no edits are needed, return: {"message":"...","edits":[]}.',
    'If user asks to run a command, fill the terminal.command field.',
    'Use relative paths from the workspace root.'
].join('\n');
const RESPONSE_FORMAT_PROMPT = [
    'RESPONSE RULES:',
    '- Output JSON only. Do not wrap in Markdown.',
    '- Include edits with full file contents when changes are requested.',
    '- If user asks to modify the active file, return an edit for that file path.',
    '- If user asks to run something, include terminal.command.'
].join('\n');
function activate(context) {
    const provider = new ChatViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('agenticCoder.chatView', provider), vscode.commands.registerCommand('agentic-coder.openChat', () => provider.reveal()), vscode.commands.registerCommand('agentic-coder.configureProviders', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'agenticCoder');
    }), vscode.commands.registerCommand('agentic-coder.applyEdits', () => provider.applyPendingEdits()));
}
function deactivate() { }
class ChatViewProvider {
    context;
    view;
    providers;
    messages;
    pendingEdits = [];
    constructor(context) {
        this.context = context;
        this.providers = (0, providers_1.getProviders)();
        this.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri,
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => this.onMessage(message));
        this.postProviders();
    }
    reveal() {
        if (this.view) {
            this.view.show(true);
            return;
        }
        vscode.commands.executeCommand('workbench.view.extension.agenticCoder');
    }
    async applyPendingEdits() {
        if (!this.pendingEdits.length) {
            vscode.window.showInformationMessage('No pending edits to apply.');
            return;
        }
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('Open a workspace folder to apply edits.');
            return;
        }
        await Promise.all(this.pendingEdits.map(async (edit) => {
            const targetUri = vscode.Uri.joinPath(workspaceRoot, edit.path);
            const dirName = path.dirname(edit.path);
            if (dirName && dirName !== '.') {
                await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceRoot, dirName));
            }
            const data = new TextEncoder().encode(edit.content);
            await vscode.workspace.fs.writeFile(targetUri, data);
        }));
        this.pendingEdits = [];
        vscode.window.showInformationMessage('Edits applied.');
    }
    async onMessage(message) {
        switch (message.type) {
            case 'ready':
                this.postProviders();
                return;
            case 'openSettings':
                vscode.commands.executeCommand('workbench.action.openSettings', 'agenticCoder');
                return;
            case 'sendPrompt':
                await this.handleSendPrompt(String(message.text ?? ''), String(message.providerId ?? ''), Boolean(message.includeActiveFile));
                return;
            case 'previewEdits':
                await this.previewPendingEdits();
                return;
            case 'applyEdits':
                await this.applyPendingEdits();
                return;
            default:
                return;
        }
    }
    getHtml(webview) {
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat.js'));
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<link href="${cssUri}" rel="stylesheet" />
	<title>Agentic Coder</title>
</head>
<body>
	<div class="container">
		<div class="header">
			<select id="provider"></select>
			<button class="secondary" id="settings">Settings</button>
			<span class="status"></span>
		</div>
		<div class="messages"></div>
		<div class="composer">
			<textarea id="prompt" placeholder="Ask for changes or guidance..."></textarea>
			<div class="row">
				<label class="toggle">
					<input type="checkbox" id="includeActive" checked />
					<span>Include active file</span>
				</label>
				<button class="primary" id="send">Send</button>
			</div>
		</div>
	</div>
	<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
    postProviders() {
        this.view?.webview.postMessage({
            type: 'providers',
            providers: this.providers.map((provider) => ({
                id: provider.id,
                label: provider.label,
                configured: provider.isConfigured(this.getProviderSettings(provider.id))
            }))
        });
    }
    getProviderSettings(providerId) {
        const config = vscode.workspace.getConfiguration('agenticCoder');
        const baseKey = `providers.${providerId}`;
        return {
            apiKey: config.get(`${baseKey}.apiKey`, ''),
            model: config.get(`${baseKey}.model`, '')
        };
    }
    async handleSendPrompt(text, providerId, includeActiveFile) {
        if (!text.trim()) {
            return;
        }
        const provider = this.providers.find((item) => item.id === providerId);
        if (!provider) {
            this.postError('Select a provider first.');
            return;
        }
        const settings = this.getProviderSettings(provider.id);
        if (!provider.isConfigured(settings)) {
            this.postError(`${provider.label} is not configured. Add an API key in settings.`);
            return;
        }
        this.view?.webview.postMessage({ type: 'status', text: 'Thinking...' });
        const contextMessage = includeActiveFile ? this.getActiveFileContext() : undefined;
        const requestMessages = [...this.messages];
        if (contextMessage) {
            requestMessages.push({ role: 'system', content: contextMessage });
        }
        requestMessages.push({ role: 'system', content: RESPONSE_FORMAT_PROMPT });
        requestMessages.push({ role: 'user', content: text });
        try {
            const rawResponse = await provider.sendChat(requestMessages, settings);
            const parsed = parseAssistantResponse(rawResponse);
            const assistantMessage = parsed.message ?? rawResponse;
            this.messages.push({ role: 'user', content: text });
            this.messages.push({ role: 'assistant', content: assistantMessage });
            this.pendingEdits = parsed.edits;
            this.view?.webview.postMessage({
                type: 'chatResponse',
                content: assistantMessage,
                hasEdits: this.pendingEdits.length > 0,
                isStructured: parsed.isStructured
            });
            if (parsed.terminal) {
                await this.runTerminalCommand(parsed.terminal);
            }
            if (!parsed.isStructured) {
                this.view?.webview.postMessage({
                    type: 'status',
                    text: 'No edits returned. Ask for changes to the active file.'
                });
            }
            this.postProviders();
        }
        catch (error) {
            this.postError(error instanceof Error ? error.message : 'Provider request failed.');
        }
    }
    postError(message) {
        this.view?.webview.postMessage({ type: 'chatError', message });
    }
    async previewPendingEdits() {
        if (!this.pendingEdits.length) {
            vscode.window.showInformationMessage('No pending edits to preview.');
            return;
        }
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('Open a workspace folder to preview edits.');
            return;
        }
        const previewRoot = vscode.Uri.joinPath(this.context.globalStorageUri, 'previews');
        await vscode.workspace.fs.createDirectory(previewRoot);
        for (const edit of this.pendingEdits) {
            const safeName = edit.path.replace(/[\\/]/g, '__');
            const newUri = vscode.Uri.joinPath(previewRoot, `${safeName}.new`);
            await vscode.workspace.fs.writeFile(newUri, new TextEncoder().encode(edit.content));
            let oldUri = vscode.Uri.joinPath(workspaceRoot, edit.path);
            try {
                await vscode.workspace.fs.stat(oldUri);
            }
            catch {
                const emptyUri = vscode.Uri.joinPath(previewRoot, `${safeName}.old`);
                await vscode.workspace.fs.writeFile(emptyUri, new Uint8Array());
                oldUri = emptyUri;
            }
            await vscode.commands.executeCommand('vscode.diff', oldUri, newUri, `Agentic Coder: ${edit.path}`);
        }
    }
    async runTerminalCommand(action) {
        const command = action.command?.trim();
        if (!command) {
            return;
        }
        const workspaceRoot = this.getWorkspaceRoot();
        let cwd;
        if (action.cwd && workspaceRoot) {
            const normalized = normalizePath(action.cwd);
            if (normalized) {
                cwd = vscode.Uri.joinPath(workspaceRoot, normalized).fsPath;
            }
        }
        const terminal = vscode.window.createTerminal({ name: 'Agentic Coder', cwd });
        terminal.show(true);
        terminal.sendText(command);
    }
    getWorkspaceRoot() {
        return vscode.workspace.workspaceFolders?.[0]?.uri;
    }
    getActiveFileContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }
        const document = editor.document;
        const workspaceRoot = this.getWorkspaceRoot();
        const relativePath = workspaceRoot
            ? vscode.workspace.asRelativePath(document.uri, false)
            : document.uri.fsPath;
        const fullText = document.getText();
        const selectedText = editor.selection.isEmpty ? '' : document.getText(editor.selection);
        const excerpt = trimContext(fullText, MAX_CONTEXT_CHARS);
        return [
            'Active file context:',
            `Path: ${relativePath}`,
            selectedText ? `Selection:\n${selectedText}` : 'Selection: (none)',
            `Content:\n${excerpt}`
        ].join('\n');
    }
}
function parseAssistantResponse(text) {
    const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
    const rawJson = jsonBlock ? jsonBlock[1] : text.trim().startsWith('{') ? text : '';
    if (!rawJson) {
        return { message: text, edits: [], isStructured: false };
    }
    try {
        const parsed = JSON.parse(rawJson);
        const edits = sanitizeEdits(parsed.edits ?? []);
        const terminal = sanitizeTerminal(parsed.terminal);
        return { message: parsed.message ?? text, edits, isStructured: true, terminal };
    }
    catch {
        return { message: text, edits: [], isStructured: false };
    }
}
function sanitizeTerminal(terminal) {
    if (!terminal?.command || typeof terminal.command !== 'string') {
        return undefined;
    }
    if (terminal.cwd && typeof terminal.cwd !== 'string') {
        return { command: terminal.command };
    }
    return { command: terminal.command, cwd: terminal.cwd };
}
function sanitizeEdits(edits) {
    return edits
        .filter((edit) => typeof edit.path === 'string' && typeof edit.content === 'string')
        .map((edit) => ({
        path: normalizePath(edit.path ?? ''),
        content: edit.content ?? ''
    }))
        .filter((edit) => Boolean(edit.path));
}
function normalizePath(inputPath) {
    const clean = inputPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
    if (!clean || clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) {
        return '';
    }
    const normalized = path.posix.normalize(clean);
    if (normalized.startsWith('..') || normalized.includes('/..')) {
        return '';
    }
    return normalized;
}
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i += 1) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function trimContext(content, maxChars) {
    if (content.length <= maxChars) {
        return content;
    }
    const headSize = Math.floor(maxChars * 0.6);
    const tailSize = maxChars - headSize;
    return `${content.slice(0, headSize)}\n...truncated...\n${content.slice(-tailSize)}`;
}
//# sourceMappingURL=extension.js.map