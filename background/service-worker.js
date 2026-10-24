/**
 * Background Service Worker
 * Multi-provider AI: Claude, OpenAI, Gemini, Qwen, DeepSeek
 */

import {
  buildQuickReadSystemPrompt, buildQuickReadPrompt,
  buildDeepAnalyzeSystemPrompt, buildDeepAnalyzePrompt
} from '../utils/prompt-builder.js';

console.log('[RepoInsight] Service worker loaded ✓');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// ─── Side Panel Port ──────────────────────────────────────────────────────────
// Side panel connects via chrome.runtime.connect({ name: 'sidepanel' }).
// Messages sent before the port is ready are queued and flushed on connect.

let sidePanelPort = null;
let messageQueue = [];

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;
  sidePanelPort = port;
  // Flush any queued messages that arrived before panel was ready
  messageQueue.forEach(m => { try { port.postMessage(m); } catch {} });
  messageQueue = [];
  port.onDisconnect.addListener(() => { sidePanelPort = null; });
});

function pushToPanel(msg) {
  if (sidePanelPort) {
    try { sidePanelPort.postMessage(msg); return; } catch { sidePanelPort = null; }
  }
  // Panel not connected yet — queue the message (capped at 500 to avoid memory leak)
  if (messageQueue.length < 500) messageQueue.push(msg);
}

// ─── Provider Configs ─────────────────────────────────────────────────────────

const PROVIDERS = {
  claude: {
    name: 'Claude (Anthropic)',
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-20241022'
  },
  openai: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o'
  },
  gemini: {
    name: 'Gemini (Google)',
    // URL built dynamically with model + key
    defaultModel: 'gemini-2.0-flash'
  },
  qwen: {
    name: 'Qwen (Alibaba)',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-max'
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat'
  }
};

// ─── Storage ──────────────────────────────────────────────────────────────────

async function getSettings() {
  return chrome.storage.sync.get({
    provider: 'claude',
    apiKeys: {},       // { claude: 'sk-ant-...', openai: 'sk-...', ... }
    models: {},        // { claude: 'claude-3-5-sonnet', openai: 'gpt-4o', ... }
    githubToken: '',
    autoPrompt: true
  });
}

async function getCached(key) {
  const r = await chrome.storage.local.get(key);
  const e = r[key];
  if (!e || Date.now() - e.timestamp > CACHE_TTL_MS) {
    if (e) chrome.storage.local.remove(key);
    return null;
  }
  return e.report;
}

async function setCache(key, report) {
  await chrome.storage.local.set({ [key]: { report, timestamp: Date.now() } });
}

// ─── Provider-Specific Streaming ─────────────────────────────────────────────

/** Claude (Anthropic) */
async function streamClaude({ apiKey, model, systemPrompt, userPrompt, maxTokens, tabId }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Claude API ${res.status}`);
  }
  return readOpenAIStyleStream(res, tabId, 'claude');
}

/** OpenAI-compatible (OpenAI / Qwen / DeepSeek) */
async function streamOpenAICompat({ url, apiKey, model, systemPrompt, userPrompt, maxTokens, tabId }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `API error ${res.status}`);
  }
  return readOpenAIStyleStream(res, tabId, 'openai');
}

/** Gemini (Google) — uses its own SSE format */
async function streamGemini({ apiKey, model, systemPrompt, userPrompt, maxTokens, tabId }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Gemini API ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '', buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        const chunk = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (chunk) {
          full += chunk;
          pushToPanel({ type: 'STREAM_CHUNK', chunk });
        }
      } catch { /* skip */ }
    }
  }
  return full;
}

/** Shared SSE reader for Claude + OpenAI-compatible */
async function readOpenAIStyleStream(res, tabId, format) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '', buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const event = JSON.parse(raw);
        let chunk = '';
        if (format === 'claude') {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta')
            chunk = event.delta.text;
        } else {
          chunk = event.choices?.[0]?.delta?.content || '';
        }
        if (chunk) {
          full += chunk;
          pushToPanel({ type: 'STREAM_CHUNK', chunk });
        }
      } catch { /* skip */ }
    }
  }
  return full;
}

// ─── Unified Streaming Dispatcher ────────────────────────────────────────────

async function streamAI({ provider, apiKey, model, systemPrompt, userPrompt, maxTokens, tabId }) {
  switch (provider) {
    case 'claude':
      return streamClaude({ apiKey, model, systemPrompt, userPrompt, maxTokens, tabId });
    case 'openai':
      return streamOpenAICompat({ url: 'https://api.openai.com/v1/chat/completions', apiKey, model, systemPrompt, userPrompt, maxTokens, tabId });
    case 'qwen':
      return streamOpenAICompat({ url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', apiKey, model, systemPrompt, userPrompt, maxTokens, tabId });
    case 'deepseek':
      return streamOpenAICompat({ url: 'https://api.deepseek.com/v1/chat/completions', apiKey, model, systemPrompt, userPrompt, maxTokens, tabId });
    case 'gemini':
      return streamGemini({ apiKey, model, systemPrompt, userPrompt, maxTokens, tabId });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  console.log('[RepoInsight] Message received:', message.type, '| tabId:', tabId);

  if (message.type === 'ANALYZE_REPO') {
    handleAnalysis(message, tabId).then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'OPEN_SIDEPANEL') {
    chrome.sidePanel.open({ tabId }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'START_ANALYSIS') {
    pushToPanel({ type: 'START_ANALYSIS', repoFullName: message.repoFullName, mode: message.mode });
    sendResponse({ ok: true });
    return true;
  }

  // Forward a content-script error to the side panel
  if (message.type === 'FORWARD_ERROR') {
    pushToPanel({ type: 'STREAM_ERROR', error: message.error });
    sendResponse({ ok: true });
    return true;
  }

  // Triggered directly from side panel's Deep Analyze button
  if (message.type === 'PANEL_DEEP_ANALYZE') {
    handlePanelDeepAnalyze(message).then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

async function handleAnalysis(message, tabId) {
  const { repoContext, repoFullName, mode = 'deep', language = 'en' } = message;
  const settings = await getSettings();

  const provider = settings.provider || 'claude';
  const apiKey = (settings.apiKeys || {})[provider];
  const model = (settings.models || {})[provider] || PROVIDERS[provider]?.defaultModel;

  console.log('[RepoInsight] Provider:', provider, '| Model:', model, '| Key present:', !!apiKey, '| Mode:', mode);

  if (!apiKey) {
    return {
      success: false,
      error: `No API key for ${PROVIDERS[provider]?.name || provider}. Open settings to add one.`
    };
  }

  const cacheKey = `cache:${repoFullName}:${mode}:${language}:${provider}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    pushToPanel({ type: 'STREAM_DONE', report: cached, mode, repoFullName, fromCache: true });
    return { success: true, report: cached, fromCache: true };
  }

  const systemPrompt = mode === 'quick' ? buildQuickReadSystemPrompt() : buildDeepAnalyzeSystemPrompt();
  const userPrompt   = mode === 'quick' ? buildQuickReadPrompt(repoContext, language) : buildDeepAnalyzePrompt(repoContext, language);
  const maxTokens    = mode === 'quick' ? 1024 : 8192;

  try {
    console.log('[RepoInsight] Calling', provider, 'API...');
    const report = await streamAI({ provider, apiKey, model, systemPrompt, userPrompt, maxTokens, tabId });
    console.log('[RepoInsight] Stream complete, chars:', report.length);
    pushToPanel({ type: 'STREAM_DONE', report, mode, repoFullName, fromCache: false });
    await setCache(cacheKey, report);
    return { success: true, report };
  } catch (err) {
    console.error('[RepoInsight] API error:', err.message);
    pushToPanel({ type: 'STREAM_ERROR', error: err.message });
    return { success: false, error: err.message };
  }
}

async function handlePanelDeepAnalyze({ repoFullName, language = 'en' }) {
  // Load the cached repoContext that content script stored after Quick Read
  const stored = await chrome.storage.local.get(`ctx:${repoFullName}`);
  const repoContext = stored[`ctx:${repoFullName}`];
  if (!repoContext) {
    pushToPanel({ type: 'STREAM_ERROR', error: 'Context not found. Please re-open the repo and analyze again.' });
    return { success: false };
  }
  // Trigger loading state in panel
  pushToPanel({ type: 'START_ANALYSIS', repoFullName, mode: 'deep' });
  // Re-use the shared analysis handler
  return handleAnalysis({ repoContext, repoFullName, mode: 'deep', language }, null);
}

chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ tabId: tab.id });
});
