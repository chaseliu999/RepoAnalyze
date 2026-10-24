// Provider metadata: models + help text
const PROVIDERS = {
  claude: {
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-api03-…',
    hint: 'Get your key at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>',
    info: '🤖 <strong>Claude</strong> — Best reasoning quality. Recommended for Deep Analyze.',
    models: [
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (best quality)' },
      { value: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku (fastest)' },
      { value: 'claude-opus-4-5-20251001',   label: 'Claude Opus 4.5 (most powerful)' }
    ]
  },
  openai: {
    label: 'OpenAI API Key',
    placeholder: 'sk-…',
    hint: 'Get your key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>',
    info: '🤖 <strong>OpenAI</strong> — GPT-4o recommended for balanced speed and quality.',
    models: [
      { value: 'gpt-4o',               label: 'GPT-4o (recommended)' },
      { value: 'gpt-4o-mini',          label: 'GPT-4o Mini (faster, cheaper)' },
      { value: 'gpt-4-turbo',          label: 'GPT-4 Turbo' },
      { value: 'o1-mini',              label: 'o1-mini (reasoning)' }
    ]
  },
  gemini: {
    label: 'Google AI API Key',
    placeholder: 'AIza…',
    hint: 'Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank">aistudio.google.com</a>',
    info: '🤖 <strong>Gemini</strong> — Large context window, great for big repos.',
    models: [
      { value: 'gemini-2.0-flash',     label: 'Gemini 2.0 Flash (fastest)' },
      { value: 'gemini-1.5-pro',       label: 'Gemini 1.5 Pro (best quality)' },
      { value: 'gemini-1.5-flash',     label: 'Gemini 1.5 Flash (balanced)' }
    ]
  },
  qwen: {
    label: 'Alibaba DashScope API Key',
    placeholder: 'sk-…',
    hint: 'Get your key at <a href="https://dashscope.aliyun.com" target="_blank">dashscope.aliyun.com</a>',
    info: '🤖 <strong>Qwen</strong> — Strong on Chinese-language repos and docs.',
    models: [
      { value: 'qwen-max',             label: 'Qwen Max (best quality)' },
      { value: 'qwen-plus',            label: 'Qwen Plus (balanced)' },
      { value: 'qwen-turbo',           label: 'Qwen Turbo (fastest)' },
      { value: 'qwen2.5-72b-instruct', label: 'Qwen 2.5 72B' }
    ]
  },
  deepseek: {
    label: 'DeepSeek API Key',
    placeholder: 'sk-…',
    hint: 'Get your key at <a href="https://platform.deepseek.com" target="_blank">platform.deepseek.com</a>',
    info: '🤖 <strong>DeepSeek</strong> — Excellent code understanding. Best value for technical repos.',
    models: [
      { value: 'deepseek-chat',        label: 'DeepSeek Chat (recommended)' },
      { value: 'deepseek-reasoner',    label: 'DeepSeek Reasoner (deep thinking)' }
    ]
  }
};

// ─── State ────────────────────────────────────────────────────────────────────

let currentProvider = 'claude';
let autoPrompt = true;
let savedApiKeys = {};
let savedModels  = {};

// ─── Load Settings ────────────────────────────────────────────────────────────

chrome.storage.sync.get(
  { provider: 'claude', apiKeys: {}, models: {}, githubToken: '', autoPrompt: true },
  (s) => {
    currentProvider = s.provider || 'claude';
    savedApiKeys    = s.apiKeys  || {};
    savedModels     = s.models   || {};
    autoPrompt      = s.autoPrompt !== false;

    document.getElementById('githubToken').value = s.githubToken || '';
    updateToggle(autoPrompt);
    activateProvider(currentProvider);
  }
);

// ─── Provider Tab Click ───────────────────────────────────────────────────────

document.getElementById('provider-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.ptab');
  if (!tab) return;
  // Save current fields before switching
  savedApiKeys[currentProvider] = document.getElementById('apiKey').value.trim();
  savedModels[currentProvider]  = document.getElementById('model').value;
  activateProvider(tab.dataset.p);
});

function activateProvider(p) {
  currentProvider = p;
  const cfg = PROVIDERS[p];

  // Tab highlight
  document.querySelectorAll('.ptab').forEach(t =>
    t.classList.toggle('active', t.dataset.p === p)
  );

  // Info banner
  document.getElementById('provider-info').innerHTML = cfg.info;

  // Key field
  document.getElementById('key-label').textContent    = cfg.label;
  document.getElementById('key-hint').innerHTML       = cfg.hint;
  document.getElementById('apiKey').placeholder       = cfg.placeholder;
  document.getElementById('apiKey').value             = savedApiKeys[p] || '';

  // Model select
  const sel = document.getElementById('model');
  sel.innerHTML = cfg.models.map(m =>
    `<option value="${m.value}">${m.label}</option>`
  ).join('');
  if (savedModels[p]) sel.value = savedModels[p];
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function updateToggle(val) {
  autoPrompt = val;
  document.getElementById('autoToggle').classList.toggle('on', val);
}
document.getElementById('autoToggle').addEventListener('click', () => updateToggle(!autoPrompt));

// ─── Save ─────────────────────────────────────────────────────────────────────

document.getElementById('btnSave').addEventListener('click', () => {
  const apiKey      = document.getElementById('apiKey').value.trim();
  const model       = document.getElementById('model').value;
  const githubToken = document.getElementById('githubToken').value.trim();
  const status      = document.getElementById('status');

  if (!apiKey) {
    status.textContent = `⚠ ${PROVIDERS[currentProvider].label} is required.`;
    status.className = 'status err';
    return;
  }

  savedApiKeys[currentProvider] = apiKey;
  savedModels[currentProvider]  = model;

  chrome.storage.sync.set({
    provider: currentProvider,
    apiKeys: savedApiKeys,
    models: savedModels,
    githubToken,
    autoPrompt
  }, () => {
    status.textContent = '✓ Saved!';
    status.className = 'status ok';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
});
