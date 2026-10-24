# RepoInsight AI

A Chrome extension that analyzes any GitHub repository with AI — directly on the page, no copy-pasting required.

## What it does

When you open a GitHub repository, RepoInsight AI appears and offers two modes:

**📖 Quick Read** — Plain-language summary from the README. Who it's for, what it does, how to get started. Translatable into 12 languages.

**🔬 Deep Analyze** — Full 11-section technical report including:
- Directory structure & entry points
- Dependencies & code quality issues
- Data flow & execution path
- **§10 Improvement Suggestions** — specific, file-level modernization recommendations based on 2025 tech trends
- **§11 Value Mining** — market opportunities, monetization paths, and integration potential

## Why it's different

| Feature | Repomix / Gitingest | GitHub Copilot | ExplainDev | **RepoInsight AI** |
|---|---|---|---|---|
| Stays on GitHub | ❌ | ✅ | ✅ | ✅ |
| Full repo analysis | ✅ | Partial | ❌ | ✅ |
| Built-in AI explanation | ❌ | ✅ | ✅ | ✅ |
| Improvement suggestions | ❌ | ❌ | ❌ | ✅ |
| Market value analysis | ❌ | ❌ | ❌ | ✅ |
| Free (your own API key) | ✅ | ❌ | ❌ | ✅ |
| Multi-provider AI | ❌ | ❌ | ❌ | ✅ |

## Supported AI Providers

Choose your preferred provider in Settings:

| Provider | Best for |
|---|---|
| **Claude** (Anthropic) | Best reasoning, recommended for Deep Analyze |
| **GPT-4o** (OpenAI) | Balanced speed and quality |
| **Gemini** (Google) | Large repos, big context window |
| **Qwen** (Alibaba) | Chinese-language repositories |
| **DeepSeek** | Code understanding, best value |

## Installation

> Not yet on the Chrome Web Store. Load as an unpacked extension for now.

1. Download or clone this repository
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `repoinsight-ai` folder
5. Click the 🔍 icon in your toolbar → enter your API key → Save

## API Keys

This extension uses **your own API key** — you pay only for what you use, and your keys never leave your browser.

- **Anthropic (Claude):** [console.anthropic.com](https://console.anthropic.com)
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Google (Gemini):** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Alibaba (Qwen):** [dashscope.aliyun.com](https://dashscope.aliyun.com)
- **DeepSeek:** [platform.deepseek.com](https://platform.deepseek.com)

**Optional:** Add a [GitHub Personal Access Token](https://github.com/settings/tokens) (read-only, `public_repo`) to raise the API rate limit from 60 to 5,000 requests/hour — needed for Deep Analyze on large repos.

## Project Structure

```
repoinsight-ai/
├── manifest.json          Chrome MV3 config
├── background/
│   └── service-worker.js  AI API calls (streaming) + caching
├── content/
│   └── content.js         GitHub page detection + banner UI + data collection
├── sidepanel/
│   ├── sidepanel.html     Report display panel
│   └── sidepanel.js       Markdown rendering + stream handling + export
├── popup/
│   ├── popup.html         Settings UI
│   └── popup.js           Multi-provider settings management
└── utils/
    ├── prompt-builder.js  Claude/AI prompt construction (11-section report)
    └── github-api.js      GitHub REST API helpers
```

## Team

Built for COM 5014 — Coding with AI  
Yeshiva University, Katz School of Science and Health

- Geoff Mangwiro
- Chixu Liu  
- Dhiransh Saxena

## License

MIT
