/**
 * Content Script — injected into every github.com page
 * Detects GitHub repo pages, shows mode-selection banner, collects repo data.
 */

(async function () {
  'use strict';

  // ─── Repo Detection ─────────────────────────────────────────────────────────

  function parseRepoFromURL() {
    const match = location.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);
    if (!match) return null;
    const [, owner, repo] = match;
    const excluded = ['settings', 'notifications', 'explore', 'marketplace', 'topics', 'trending'];
    if (excluded.includes(owner)) return null;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  const repoInfo = parseRepoFromURL();
  if (!repoInfo) return;
  if (document.getElementById('repoinsight-banner')) return;

  const dismissKey = `dismissed:${repoInfo.fullName}`;
  if (sessionStorage.getItem(dismissKey)) return;

  // ─── Inject Styles ───────────────────────────────────────────────────────────

  const style = document.createElement('style');
  style.textContent = `
    #repoinsight-banner {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      animation: ri-slide-in 0.3s ease-out;
    }
    @keyframes ri-slide-in {
      from { transform: translateY(16px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    #ri-inner {
      background: #fff;
      border: 1px solid #d0d7de;
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.14);
      padding: 14px 16px;
      width: 360px;
    }
    @media (prefers-color-scheme: dark) {
      #ri-inner { background: #161b22; border-color: #30363d; color: #e6edf3; }
    }
    #ri-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    #ri-title { font-weight: 600; font-size: 13px; color: #0969da; }
    @media (prefers-color-scheme: dark) { #ri-title { color: #58a6ff; } }
    #ri-repo-name { font-size: 11px; color: #57606a; margin-top: 1px; }
    @media (prefers-color-scheme: dark) { #ri-repo-name { color: #8b949e; } }
    #ri-dismiss {
      background: none; border: none; cursor: pointer;
      color: #57606a; font-size: 16px; padding: 0 4px; line-height: 1;
    }
    #ri-mode-row {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .ri-mode-btn {
      flex: 1;
      padding: 10px 8px;
      border-radius: 8px;
      border: 1.5px solid #d0d7de;
      background: #f6f8fa;
      cursor: pointer;
      text-align: center;
      transition: border-color 0.15s, background 0.15s;
    }
    .ri-mode-btn:hover { border-color: #0969da; background: #ddf4ff; }
    @media (prefers-color-scheme: dark) {
      .ri-mode-btn { background: #0d1117; border-color: #30363d; color: #e6edf3; }
      .ri-mode-btn:hover { border-color: #58a6ff; background: #0c2d6b; }
    }
    .ri-mode-btn .ri-mode-icon { font-size: 18px; display: block; margin-bottom: 4px; }
    .ri-mode-btn .ri-mode-label { font-size: 12px; font-weight: 600; display: block; }
    .ri-mode-btn .ri-mode-desc { font-size: 10px; color: #57606a; display: block; margin-top: 2px; }
    @media (prefers-color-scheme: dark) { .ri-mode-btn .ri-mode-desc { color: #8b949e; } }
    #ri-lang-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: #57606a;
    }
    @media (prefers-color-scheme: dark) { #ri-lang-row { color: #8b949e; } }
    #ri-lang-select {
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      font-size: 12px;
      background: #f6f8fa;
      color: #1f2328;
    }
    @media (prefers-color-scheme: dark) {
      #ri-lang-select { background: #0d1117; border-color: #30363d; color: #e6edf3; }
    }
    #ri-status {
      font-size: 12px;
      color: #57606a;
      padding: 8px 0 2px;
      display: none;
      align-items: center;
      gap: 6px;
    }
    .ri-spinner {
      width: 12px; height: 12px;
      border: 2px solid #d0d7de;
      border-top-color: #0969da;
      border-radius: 50%;
      animation: ri-spin 0.7s linear infinite;
      flex-shrink: 0;
    }
    @keyframes ri-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);

  // ─── Inject Banner HTML ──────────────────────────────────────────────────────

  const banner = document.createElement('div');
  banner.id = 'repoinsight-banner';
  banner.innerHTML = `
    <div id="ri-inner">
      <div id="ri-header">
        <div>
          <div id="ri-title">🔍 RepoInsight AI</div>
          <div id="ri-repo-name">${repoInfo.fullName}</div>
        </div>
        <button id="ri-dismiss" title="Dismiss">✕</button>
      </div>

      <div id="ri-mode-row">
        <button class="ri-mode-btn" id="ri-btn-quick">
          <span class="ri-mode-icon">📖</span>
          <span class="ri-mode-label">Quick Read</span>
          <span class="ri-mode-desc">Plain language · Fast · Translatable</span>
        </button>
        <button class="ri-mode-btn" id="ri-btn-deep">
          <span class="ri-mode-icon">🔬</span>
          <span class="ri-mode-label">Deep Analyze</span>
          <span class="ri-mode-desc">Full code analysis · Improvements · Value</span>
        </button>
      </div>

      <div id="ri-lang-row">
        <span>🌐 Language:</span>
        <select id="ri-lang-select">
          <option value="en">English</option>
          <option value="zh">中文 (Chinese)</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="pt">Português</option>
          <option value="ru">Русский</option>
          <option value="ar">العربية</option>
          <option value="hi">हिन्दी</option>
          <option value="it">Italiano</option>
        </select>
        <span style="font-size:10px;color:#8b949e">applies to both modes</span>
      </div>

      <div id="ri-status">
        <div class="ri-spinner"></div>
        <span id="ri-status-text">Loading…</span>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  // ─── Restore saved language preference ──────────────────────────────────────

  const { preferredLang } = await chrome.storage.sync.get({ preferredLang: 'en' });
  document.getElementById('ri-lang-select').value = preferredLang;

  // Save language on change
  document.getElementById('ri-lang-select').addEventListener('change', (e) => {
    chrome.storage.sync.set({ preferredLang: e.target.value });
  });

  // ─── Event Handlers ──────────────────────────────────────────────────────────

  document.getElementById('ri-dismiss').addEventListener('click', () => {
    sessionStorage.setItem(dismissKey, '1');
    banner.remove();
  });

  document.getElementById('ri-btn-quick').addEventListener('click', () => {
    const lang = document.getElementById('ri-lang-select').value;
    startAnalysis('quick', lang);
  });

  document.getElementById('ri-btn-deep').addEventListener('click', () => {
    const lang = document.getElementById('ri-lang-select').value;
    startAnalysis('deep', lang);
  });

  // ─── Analysis Flow ───────────────────────────────────────────────────────────

  function setStatus(text) {
    const statusEl = document.getElementById('ri-status');
    statusEl.style.display = 'flex';
    document.getElementById('ri-status-text').textContent = text;
    document.getElementById('ri-mode-row').style.opacity = '0.4';
    document.getElementById('ri-mode-row').style.pointerEvents = 'none';
  }

  async function startAnalysis(mode, language) {
    setStatus(mode === 'quick' ? '📖 Reading README…' : '🔬 Scanning repository…');

    // Open panel and show loading state BEFORE collecting data
    // so any subsequent error is visible in the panel, not just the banner
    await chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
    chrome.runtime.sendMessage({ type: 'START_ANALYSIS', repoFullName: repoInfo.fullName, mode });

    try {
      const repoContext = await collectRepoContext(repoInfo.owner, repoInfo.repo, mode);

      // Cache context so Deep Analyze button in panel can reuse it
      chrome.storage.local.set({ [`ctx:${repoInfo.fullName}`]: repoContext });

      setStatus('🤖 Analyzing with Claude…');

      const result = await chrome.runtime.sendMessage({
        type: 'ANALYZE_REPO',
        repoContext,
        repoFullName: repoInfo.fullName,
        mode,
        language
      });

      if (!result.success) {
        showBannerError(result.error);
        return;
      }

      banner.remove();
    } catch (err) {
      const msg = err.message.includes('403')
        ? 'GitHub API rate limit hit (60 req/hr). Add a GitHub token in ⚙ Settings to fix this.'
        : err.message;
      showBannerError(msg);
      // Also push error to panel so it doesn't stay stuck in loading
      chrome.runtime.sendMessage({ type: 'FORWARD_ERROR', error: msg });
    }
  }

  function showBannerError(msg) {
    const statusEl = document.getElementById('ri-status');
    const modeRow  = document.getElementById('ri-mode-row');
    if (statusEl) {
      statusEl.style.display = 'flex';
      document.getElementById('ri-status-text').textContent = `⚠ ${msg}`;
    }
    if (modeRow) {
      modeRow.style.opacity = '1';
      modeRow.style.pointerEvents = 'auto';
    }
  }

  // ─── GitHub Data Collection ──────────────────────────────────────────────────

  async function githubFetch(url) {
    const { githubToken } = await chrome.storage.sync.get({ githubToken: '' });
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'RepoInsight-AI-Extension'
    };
    if (githubToken) headers['Authorization'] = `token ${githubToken}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async function collectRepoContext(owner, repo, mode) {
    const API = 'https://api.github.com';

    const [repoData, languages, topicsData] = await Promise.all([
      githubFetch(`${API}/repos/${owner}/${repo}`),
      githubFetch(`${API}/repos/${owner}/${repo}/languages`),
      githubFetch(`${API}/repos/${owner}/${repo}/topics`).catch(() => ({ names: [] }))
    ]);

    const metadata = {
      full_name: repoData.full_name,
      description: repoData.description,
      homepage: repoData.homepage,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      open_issues: repoData.open_issues_count,
      license: repoData.license?.name || 'None',
      created_at: repoData.created_at,
      updated_at: repoData.updated_at,
      default_branch: repoData.default_branch,
      size_kb: repoData.size
    };

    // Quick Read: only fetch README + basic metadata
    if (mode === 'quick') {
      const fileContents = {};
      for (const name of ['README.md', 'readme.md', 'README.rst', 'README.txt']) {
        try {
          const data = await githubFetch(`${API}/repos/${owner}/${repo}/contents/${name}`);
          if (data.encoding === 'base64') {
            fileContents[name] = atob(data.content.replace(/\n/g, '')).slice(0, 8000);
            break;
          }
        } catch { /* try next */ }
      }
      return { metadata, languages, topics: topicsData.names || [], file_contents: fileContents,
               structure: { total_files: 0, source_files_count: 0, test_files_count: 0,
                            directories: [], sample_source_files: [], test_files: [], tree_truncated: false },
               recent_commits: [] };
    }

    // Deep Analyze: full tree traversal — read as much code as possible
    const SKIP = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.next',
                          'target', 'vendor', 'venv', '.venv', 'coverage', '.nyc_output',
                          'tmp', 'temp', 'logs', 'assets', 'static', 'public', 'images']);
    const SOURCE_EXT = new Set(['.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java',
                                 '.cpp', '.c', '.cs', '.rb', '.php', '.swift', '.kt', '.vue',
                                 '.svelte', '.sh', '.yaml', '.yml', '.toml', '.json']);
    const CONFIG_FILES = ['README.md', 'readme.md', 'package.json', 'pyproject.toml', 'setup.py',
                          'requirements.txt', 'go.mod', 'Dockerfile', 'Cargo.toml',
                          'CONTRIBUTING.md', 'ARCHITECTURE.md', '.github/workflows',
                          'docker-compose.yml', 'Makefile', 'setup.cfg'];

    const branchData = await githubFetch(`${API}/repos/${owner}/${repo}/branches/${repoData.default_branch}`);
    const treeSha = branchData.commit.commit.tree.sha;
    const treeData = await githubFetch(`${API}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);

    const allFiles = (treeData.tree || []).filter(item =>
      item.type === 'blob' && !item.path.split('/').some(p => SKIP.has(p))
    );
    const sourceFiles = allFiles
      .filter(f => SOURCE_EXT.has('.' + f.path.split('.').pop()) &&
                   !f.path.includes('test') && !f.path.includes('spec') &&
                   !f.path.includes('.min.') && !f.path.includes('generated'))
      .sort((a, b) => (b.size || 0) - (a.size || 0)); // largest files first — more code = more important
    const testFiles = allFiles.filter(f =>
      f.path.includes('test') || f.path.includes('spec') || f.path.includes('__tests__')
    ).map(f => f.path);
    const dirs = [...new Set(allFiles.map(f => f.path.split('/')[0]).filter(Boolean))];

    // Build fetch list: config files + entry points + one key file per top dir + largest files
    const entryPoints = sourceFiles
      .filter(f => {
        const base = f.path.split('/').pop().toLowerCase().replace(/\.[^.]+$/, '');
        return ['main', 'index', 'app', 'server', 'cli', 'run', '__main__', 'core', 'api'].includes(base);
      })
      .map(f => f.path).slice(0, 6);

    // One representative (largest) file per top-level directory
    const perDirFiles = [];
    const seenDirs = new Set();
    for (const f of sourceFiles) {
      const topDir = f.path.split('/')[0];
      if (!seenDirs.has(topDir)) {
        seenDirs.add(topDir);
        perDirFiles.push(f.path);
      }
    }

    // With token: up to 35 files. Without token: cap at 15 to avoid 403
    const { githubToken } = await chrome.storage.sync.get({ githubToken: '' });
    const fileLimit = githubToken ? 35 : 15;

    const toFetch = [...new Set([
      ...CONFIG_FILES.filter(p => allFiles.find(f => f.path === p)),
      ...entryPoints,
      ...perDirFiles,
      ...sourceFiles.slice(0, 20).map(f => f.path)
    ])].slice(0, fileLimit);

    const fileContents = {};
    // Fetch in batches of 6 to avoid overwhelming GitHub API
    for (let i = 0; i < toFetch.length; i += 6) {
      await Promise.all(toFetch.slice(i, i + 6).map(async (path) => {
        try {
          const data = await githubFetch(`${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
          if (data.encoding === 'base64') {
            fileContents[path] = atob(data.content.replace(/\n/g, '')).slice(0, 5000);
          }
        } catch { /* skip */ }
      }));
    }

    let recentCommits = [];
    try {
      const commits = await githubFetch(`${API}/repos/${owner}/${repo}/commits?per_page=8`);
      recentCommits = commits.map(c => ({
        message: c.commit.message.split('\n')[0],
        date: c.commit.author.date,
        author: c.commit.author.name
      }));
    } catch { /* optional */ }

    return {
      metadata, languages, topics: topicsData.names || [], file_contents: fileContents,
      structure: {
        total_files: allFiles.length, source_files_count: sourceFiles.length,
        test_files_count: testFiles.length, directories: dirs,
        sample_source_files: sourceFiles.slice(0, 25), test_files: testFiles.slice(0, 15),
        tree_truncated: treeData.truncated || false
      },
      recent_commits: recentCommits
    };
  }

  // ─── Listen for side panel → content script messages ─────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TRIGGER_DEEP' && msg.repoFullName === repoInfo.fullName) {
      chrome.storage.sync.get({ preferredLang: 'en' }, ({ preferredLang }) => {
        startAnalysis('deep', preferredLang);
      });
    }
    if (msg.type === 'RETRANSLATE' && msg.repoFullName === repoInfo.fullName) {
      startAnalysis('quick', msg.lang);
    }
  });

})();
