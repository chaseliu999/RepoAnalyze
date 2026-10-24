# RepoInsight AI — Chrome Extension

AI-powered GitHub repository analyzer. Detects GitHub repo pages, collects context via GitHub API, calls Claude API (streaming), renders an 11-section Markdown report in a Chrome Side Panel.

## Architecture

```
manifest.json          MV3 Chrome extension config
background/
  service-worker.js    Claude API streaming + cache (chrome.storage.local, 6hr TTL)
content/
  content.js           GitHub repo detection + banner UI + GitHub API data collection
sidepanel/
  sidepanel.html/js    Report rendering + TOC navigation + export (copy/download .md)
popup/
  popup.html/js        Settings: Anthropic API key, GitHub token, model choice, auto-prompt toggle
utils/
  github-api.js        GitHub REST API helpers (standalone, not used in extension build — logic inlined in content.js)
  prompt-builder.js    Claude prompt construction (imported by service-worker.js)
```

## Key Design Decisions

- **No backend**: Everything runs client-side. Anthropic API called directly from service worker with `anthropic-dangerous-direct-browser-access: true` header.
- **GitHub API, not DOM scraping**: More reliable, structured data. 60 req/hr unauthenticated, 5000 with GitHub token.
- **Streaming**: Claude response streamed chunk-by-chunk, relayed content → background → sidepanel via `chrome.tabs.sendMessage`.
- **Caching**: Reports cached in `chrome.storage.local` for 6 hours to avoid repeated API costs.
- **Two special sections**: §10 Improvement Suggestions + §11 Value Mining are our differentiators vs competitors.

## Report Sections

§1 Overview · §2 Structure · §3 Languages · §4 Entry Points · §5 Modules · §6 Tests · §7 Data Flow · §8 Docs · §9 Quality · **§10 Improvements** · **§11 Value Mining**

## Commands

- Load in Chrome: chrome://extensions → Developer mode → Load unpacked → select this directory
- No build step needed (vanilla JS, no bundler)
- Test: open any public GitHub repo (e.g., github.com/yamadashy/repomix)

## Gotchas

- `anthropic-dangerous-direct-browser-access: true` header is REQUIRED for browser-to-Anthropic API calls
- Content scripts cannot use ES module imports — all utils are inlined in content.js
- Side panel must be opened BEFORE streaming starts, or chunks are lost
- GitHub API `topics` endpoint requires `Accept: application/vnd.github.mercy-preview+json` header (already set)
- Chrome MV3: service workers have no persistent state — use chrome.storage for all persistence

## Models Available (configurable in popup)

- `claude-3-5-sonnet-20241022` — best quality (default)
- `claude-3-5-haiku-20241022` — fastest, cheapest
- `claude-opus-4-5-20251001` — most powerful, slowest
