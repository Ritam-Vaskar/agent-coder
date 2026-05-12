const vscode = acquireVsCodeApi();

const state = {
	providerId: '',
	isBusy: false,
	providers: []
};

const messagesEl = document.querySelector('.messages');
const providerSelect = document.querySelector('#provider');
const statusEl = document.querySelector('.status');
const promptEl = document.querySelector('#prompt');
const sendButton = document.querySelector('#send');
const settingsButton = document.querySelector('#settings');
const includeActiveEl = document.querySelector('#includeActive');
const clearButton = document.querySelector('#clear');
const emptyStateEl = document.querySelector('#emptyState');
const providerStatusEl = document.querySelector('#providerStatus');

function setStatus(text) {
	statusEl.textContent = text || '';
}

function updateEmptyState() {
	if (!emptyStateEl) {
		return;
	}
	const hasMessages = messagesEl.querySelectorAll('.message').length > 0;
	emptyStateEl.style.display = hasMessages ? 'none' : 'block';
}

function setBusy(isBusy) {
	state.isBusy = isBusy;
	sendButton.disabled = isBusy;
	promptEl.disabled = isBusy;
	providerSelect.disabled = isBusy;
	settingsButton.disabled = isBusy;
	if (clearButton) {
		clearButton.disabled = isBusy;
	}
}

function addMessage(role, content, hasEdits) {
	const message = document.createElement('div');
	message.className = `message ${role}`;
	message.textContent = content;

	if (hasEdits) {
		const actions = document.createElement('div');
		actions.className = 'actions';

		const previewButton = document.createElement('button');
		previewButton.className = 'secondary';
		previewButton.textContent = 'Preview edits';
		previewButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'previewEdits' });
		});

		const applyButton = document.createElement('button');
		applyButton.className = 'primary';
		applyButton.textContent = 'Apply edits';
		applyButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'applyEdits' });
		});

		actions.append(previewButton, applyButton);
		message.appendChild(actions);
	}

	messagesEl.appendChild(message);
	messagesEl.scrollTop = messagesEl.scrollHeight;
	updateEmptyState();
}

function updateProviders(providers) {
	state.providers = providers || [];
	providerSelect.innerHTML = '';
	providers.forEach((provider) => {
		const option = document.createElement('option');
		option.value = provider.id;
		option.textContent = provider.configured ? provider.label : `${provider.label} (needs key)`;
		providerSelect.appendChild(option);
	});

	if (!state.providerId && providers.length) {
		state.providerId = providers[0].id;
		providerSelect.value = state.providerId;
	}

	const selected = state.providers.find((provider) => provider.id === providerSelect.value);
	if (providerStatusEl) {
		providerStatusEl.textContent = selected?.configured ? 'Ready' : 'Needs key';
	}
}

providerSelect.addEventListener('change', () => {
	state.providerId = providerSelect.value;
	const selected = state.providers.find((provider) => provider.id === providerSelect.value);
	if (providerStatusEl) {
		providerStatusEl.textContent = selected?.configured ? 'Ready' : 'Needs key';
	}
});

if (clearButton) {
	clearButton.addEventListener('click', () => {
		messagesEl.querySelectorAll('.message').forEach((node) => node.remove());
		updateEmptyState();
		vscode.postMessage({ type: 'clearChat' });
	});
});

sendButton.addEventListener('click', () => {
	const text = promptEl.value.trim();
	if (!text || state.isBusy) {
		return;
	}

	addMessage('user', text, false);
	promptEl.value = '';
	setStatus('Sending...');
	setBusy(true);
	vscode.postMessage({
		type: 'sendPrompt',
		text,
		providerId: state.providerId,
		includeActiveFile: includeActiveEl ? includeActiveEl.checked : true
	});
});

settingsButton.addEventListener('click', () => {
	vscode.postMessage({ type: 'openSettings' });
});

promptEl.addEventListener('keydown', (event) => {
	if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
		sendButton.click();
	}
});

window.addEventListener('message', (event) => {
	const message = event.data;

	switch (message.type) {
		case 'providers':
			updateProviders(message.providers);
			break;
		case 'chatResponse':
			addMessage('assistant', message.content, message.hasEdits);
			setStatus('');
			setBusy(false);
			break;
		case 'chatError':
			addMessage('assistant', message.message, false);
			setStatus('');
			setBusy(false);
			break;
		case 'status':
			setStatus(message.text || '');
			break;
		case 'cleared':
			messagesEl.querySelectorAll('.message').forEach((node) => node.remove());
			updateEmptyState();
			break;
		default:
			break;
	}
});

vscode.postMessage({ type: 'ready' });
updateEmptyState();
