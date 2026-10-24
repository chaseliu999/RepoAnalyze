/**
 * Side Panel — handles streaming display, mode switching, translation, export
 *
 * MV3 MESSAGE ARCHITECTURE:
 *   Side panel → background: chrome.runtime.sendMessage  (one-shot)
 *   Background → side panel: chrome.runtime.connect port (persistent)
 *   Background → content script: chrome.tabs.sendMessage (content scripts only)
 */

// Establish persistent port so background can push chunks to us
const port = chrome.runtime.connect({ name: 'sidepanel' });
port.onMessage.addListener((msg) => handleMessage(msg));
port.onDisconnect.addListener(() => {
  // Port closes when service worker goes idle; reconnect on next user action
});

// Also listen for one-shot messages (fallback / settings open etc.)
chrome.runtime.onMessage.addListener((msg) => handleMessage(msg));

// ─── Simple Markdown Renderer ─────────────────────────────────────────────────

function renderMarkdown(md) {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^#{1} (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^#{2} (.+)$/gm, (_, t) => {
    const id = t.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    return `<h2 id="${id}">${t}</h2>`;
  });
  html = html.replace(/^#{3} (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*(<(?:h[1-6]|ul|pre|hr|blockquote)[^>]*>)/g, '$1');
  html = html.replace(/(<\/(?:h[1-6]|ul|pre|hr|blockquote)>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');
  return html;
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentReport = '';
let currentRepo = '';
let currentMode = 'deep';
let currentContext = null; // Stored for re-translate

// ─── Elements ─────────────────────────────────────────────────────────────────

const $empty    = document.getElementById('empty-state');
const $loading  = document.getElementById('loading-state');
const $report   = document.getElementById('report-state');
const $error    = document.getElementById('error-state');
const $preview  = document.getElementById('stream-preview');
const $content  = document.getElementById('report-content');
const $sub      = document.getElementById('header-sub');
const $badge    = document.getElementById('mode-badge');
const $toc      = document.getElementById('toc');
const $langBar  = document.getElementById('lang-bar');
const $upgBar   = document.getElementById('upgrade-bar');
const $meta     = document.getElementById('footer-meta');
const $copy     = document.getElementById('btn-copy');
const $dl       = document.getElementById('btn-download');

function showState(s) {
  $empty.style.display   = s === 'empty'   ? 'flex'  : 'none';
  $loading.style.display = s === 'loading' ? 'flex'  : 'none';
  $report.style.display  = s === 'report'  ? 'flex'  : 'none';
  $error.style.display   = s === 'error'   ? 'flex'  : 'none';
  $copy.style.display    = s === 'report'  ? ''      : 'none';
  $dl.style.display      = s === 'report'  ? ''      : 'none';
}

function showReport(markdown, repo, mode, fromCache) {
  currentReport = markdown;
  currentRepo   = repo;
  currentMode   = mode;

  $content.innerHTML = renderMarkdown(markdown);
  $sub.textContent   = repo;
  $meta.textContent  = fromCache ? 'cached' : `Generated ${new Date().toLocaleTimeString()}`;

  // Mode badge
  $badge.textContent  = mode === 'quick' ? '📖 Quick Read' : '🔬 Deep Analyze';
  $badge.className    = mode === 'quick' ? 'quick' : 'deep';
  $badge.style.display = 'block';

  // Mode-specific UI
  $toc.style.display     = mode === 'deep'  ? 'flex' : 'none';
  $langBar.style.display = mode === 'quick' ? 'flex' : 'none';
  $upgBar.style.display  = mode === 'quick' ? 'flex' : 'none';

  showState('report');
}

// ─── Message Handler ──────────────────────────────────────────────────────────

let streamBuffer = '';

function handleMessage(msg) {
  switch (msg.type) {
    case 'START_ANALYSIS': {
      streamBuffer = '';
      $preview.textContent = '';
      $sub.textContent = msg.repoFullName;
      const isQuick = msg.mode === 'quick';
      const lh = document.getElementById('loading-header');
      lh.textContent = isQuick ? '📖 Generating Quick Read…' : '🔬 Deep analyzing repository…';
      lh.className   = isQuick ? 'pulse quick' : 'pulse deep';
      document.getElementById('loading-sub').textContent = isQuick
        ? 'Reading README · ~5 seconds'
        : 'Scanning code structure · ~30 seconds';
      showState('loading');
      break;
    }
    case 'STREAM_CHUNK':
      streamBuffer += msg.chunk;
      $preview.textContent = '…' + streamBuffer.slice(-600);
      $preview.scrollTop = $preview.scrollHeight;
      break;

    case 'STREAM_DONE':
      showReport(msg.report, msg.repoFullName, msg.mode || currentMode, msg.fromCache);
      break;

    case 'STREAM_ERROR':
      document.getElementById('error-msg').textContent = msg.error;
      showState('error');
      break;
  }
}

// ─── TOC Navigation ───────────────────────────────────────────────────────────

$toc.addEventListener('click', e => {
  const item = e.target.closest('.toc-item');
  if (!item) return;
  const sNum = item.dataset.s;
  // Find heading containing §N
  const headings = $content.querySelectorAll('h2, h3');
  for (const h of headings) {
    if (h.textContent.includes(`§${sNum}`)) {
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
});

// ─── Language Switcher (Quick Read) ──────────────────────────────────────────

document.getElementById('btn-retranslate').addEventListener('click', async () => {
  const lang = document.getElementById('lang-select').value;
  if (!currentContext) return;

  // Save preference
  chrome.storage.sync.set({ preferredLang: lang });

  // Show loading then re-request
  showState('loading');
  document.getElementById('loading-header').textContent = '🌐 Translating…';
  document.getElementById('loading-header').className = 'pulse quick';
  document.getElementById('loading-sub').textContent = `Switching to ${lang}…`;

  // Get active tab and send re-analyze message
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, {
    type: 'RETRANSLATE',
    lang,
    repoFullName: currentRepo
  });
});

// ─── Upgrade to Deep Analyze ──────────────────────────────────────────────────

document.getElementById('btn-upgrade').addEventListener('click', async () => {
  const lang = document.getElementById('lang-select').value;
  // Send directly to background — no need to go through content script
  chrome.runtime.sendMessage({
    type: 'PANEL_DEEP_ANALYZE',
    repoFullName: currentRepo,
    language: lang
  });
});

// ─── Export ───────────────────────────────────────────────────────────────────

$copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(currentReport);
  $copy.textContent = '✓ Copied';
  setTimeout(() => { $copy.textContent = 'Copy'; }, 2000);
});

$dl.addEventListener('click', () => {
  const blob = new Blob([currentReport], { type: 'text/markdown' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `repoinsight-${(currentRepo || 'report').replace('/', '-')}.md`
  });
  a.click();
});

// ─── Buttons ──────────────────────────────────────────────────────────────────

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById('btn-open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById('btn-new').addEventListener('click', () => {
  currentReport = ''; currentRepo = ''; currentMode = 'deep';
  $badge.style.display = 'none';
  $sub.textContent = 'Open a GitHub repo to begin';
  showState('empty');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

showState('empty');
