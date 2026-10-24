/**
 * Builds Claude prompts for two modes:
 * - Quick Read: plain-language README summary with translation support
 * - Deep Analyze: full 11-section professional report
 */

const LANGUAGE_NAMES = {
  en: 'English', zh: 'Chinese (简体中文)', es: 'Spanish', fr: 'French',
  de: 'German', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', hi: 'Hindi', it: 'Italian'
};

function formatLanguages(languages) {
  const total = Object.values(languages).reduce((a, b) => a + b, 0);
  if (total === 0) return 'Unknown';
  return Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .map(([lang, bytes]) => `${lang} (${Math.round((bytes / total) * 100)}%)`)
    .join(', ');
}

function formatFileContents(fileContents) {
  if (!fileContents || Object.keys(fileContents).length === 0) {
    return 'No key files could be retrieved.';
  }
  return Object.entries(fileContents)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');
}

// ─── QUICK READ MODE ─────────────────────────────────────────────────────────

export function buildQuickReadSystemPrompt() {
  return `You are RepoInsight AI in Quick Read mode. Your job is to explain GitHub projects to anyone — including non-developers — in plain, friendly language. No jargon. No code. Think of yourself as a knowledgeable friend explaining what a GitHub project is, not a software engineer writing documentation.

Rules:
- Write like you're talking to someone curious but not technical
- Never paste code or file paths
- Keep each section concise — bullets preferred over long paragraphs
- Be honest about limitations or complexity without being discouraging
- Always respond in the language specified in the request`;
}

export function buildQuickReadPrompt(repoContext, language = 'en') {
  const { metadata, languages, topics, file_contents } = repoContext;
  const langName = LANGUAGE_NAMES[language] || language;

  const readme = file_contents['README.md'] || file_contents['readme.md'] ||
    file_contents['README.rst'] || Object.values(file_contents)[0] || 'No README found.';

  return `# Quick Read Request

## Repository: ${metadata.full_name}
- **Stars:** ${metadata.stars.toLocaleString()} | **Forks:** ${metadata.forks}
- **Description:** ${metadata.description || 'None provided'}
- **Topics:** ${topics.join(', ') || 'None'}
- **Main languages:** ${formatLanguages(languages)}
- **Last updated:** ${new Date(metadata.updated_at).toLocaleDateString()}

## README Content:
${readme.slice(0, 6000)}

---

## Your Task

Write a **Quick Read** summary in **${langName}**. Structure it exactly like this:

### 🔍 What is this?
In 2-3 sentences, explain what this project does as if explaining to a curious friend with no coding background.

### 🎯 Who is it for?
Who would actually use this? Be specific (e.g., "designers who want to...", "developers building...", "students learning...").

### ⚡ What can you do with it?
3-5 bullet points of concrete things a user can accomplish with this project. Start each bullet with an action verb.

### 🚀 How do you get started?
The simplest possible path to try it out. Skip technical details — just the gist.

### 💡 Why does this exist?
What problem was this built to solve? What would you have to do without it?

### ⭐ Is it worth your attention?
A honest 2-3 sentence take: is this project mature/useful/active? Any caveats?

---
*Reply entirely in ${langName}. Keep the emoji section headers exactly as shown above.*`;
}

// ─── DEEP ANALYZE MODE ───────────────────────────────────────────────────────

export function buildDeepAnalyzeSystemPrompt() {
  return `You are RepoInsight AI in Deep Analyze mode — a senior software architect producing dense, evidence-based technical reports. You have been given real source code. Use it.

## Non-negotiable rules

**Specificity mandate:** Every observation must cite evidence. Name the exact file, function, class, or config key you are referring to. If you cannot point to evidence, do not make the claim.

**Forbidden phrases** — never write these or anything like them:
- "could be improved", "might want to consider", "it appears that", "seems to"
- "the codebase uses standard patterns", "follows best practices", "well-structured"
- "further investigation needed", "more information required"
- Any claim without a file path or function name attached

**Format for each observation:**
> In \`path/to/file.py\`, function \`foo()\` does X. This means Y. Therefore Z.

**For §10 improvements:** Use this format for every suggestion:
> **[filename:function]** Current approach: [specific description]. Recommended: [specific replacement with library/pattern name]. Impact: [concrete benefit].

**For §11 value mining:** Back every market claim with a real comparable (name a real product, company, or market size). No abstract assertions.

Always respond in the language specified in the request.`;
}

export function buildDeepAnalyzePrompt(repoContext, language = 'en') {
  const { metadata, languages, topics, structure, file_contents, recent_commits } = repoContext;

  const langName = LANGUAGE_NAMES[language] || language;
  const langInstruction = language !== 'en'
    ? `\n**IMPORTANT: Write the entire report in ${langName}. All section titles, descriptions, and analysis must be in ${langName}.**\n`
    : '';

  return `# Deep Repository Analysis Request${langInstruction}

## Repository: ${metadata.full_name}
- **Description:** ${metadata.description || 'Not provided'}
- **License:** ${metadata.license} | **Stars:** ${metadata.stars.toLocaleString()} | **Forks:** ${metadata.forks} | **Open Issues:** ${metadata.open_issues}
- **Created:** ${new Date(metadata.created_at).toLocaleDateString()} | **Updated:** ${new Date(metadata.updated_at).toLocaleDateString()} | **Size:** ${Math.round(metadata.size_kb / 1024 * 10) / 10} MB
- **Topics:** ${topics.join(', ') || 'None'}
- **Languages:** ${formatLanguages(languages)}

## Repository Structure
- Files: ${structure.total_files}${structure.tree_truncated ? ' (large repo, tree truncated)' : ''} | Source: ${structure.source_files_count} | Tests: ${structure.test_files_count}
- **All directories:** ${structure.directories.slice(0, 30).map(d => `${d}/`).join(', ') || '(flat)'}
- **All source files:** ${structure.sample_source_files.join(', ')}
- **Test files:** ${structure.test_files.join(', ') || 'None'}

## Recent Commits
${recent_commits.length > 0
  ? recent_commits.map(c => `- [${new Date(c.date).toLocaleDateString()}] ${c.message} (${c.author})`).join('\n')
  : '- Could not retrieve'}

---

## Full File Contents (${Object.keys(file_contents).length} files)

${formatFileContents(file_contents)}

---

## Report Required

Write a detailed technical report in Markdown with EXACTLY these 11 sections.

**Remember the rules:**
- Every claim cites a specific file + function/class name
- No vague language ("could be improved", "seems to", "appears to")
- Each section must have 3–6 specific, evidence-backed points — no padding

---

### §1 Repository Overview
State the project's exact purpose in one sentence. Then: what real problem does it solve, who uses it, and what is its maturity level (prototype / active / stable / unmaintained)? Cite the README and commit history as evidence.

### §2 Directory & File Map
For each top-level directory, state its exact role and name the most important file inside it. Identify the overall architectural pattern (MVC / layered / monorepo / microservices / etc.) with file evidence.

### §3 Languages & Dependencies
List every dependency found in config files with its version. Flag any that are outdated (>2 major versions behind as of 2025), have known CVEs, or are unusually heavy for the task.

### §4 Entry Points
Name every entry point exactly: file path + function/command. Show what arguments it accepts and what it returns or triggers. Trace the first 3 function calls from the main entry.

### §5 Major Modules & Components
For each major module: name the file, its primary class/function, its inputs and outputs, and which other modules it depends on. Draw the dependency graph in text form.

### §6 Test Coverage
Name specific test files and what they test. Identify which core modules have NO tests. Check for CI config (.github/workflows, .travis.yml, etc.) and describe what it runs.

### §7 Data Flow & Execution Summary
Trace one complete execution path from user input to final output, naming every function called along the way. Include error paths if visible.

### §8 Documentation Observations
Assess README completeness: does it have installation, usage, API reference, contribution guide? Name specific missing sections. Check for inline code comments quality in the source files.

### §9 Code Quality & Maintenance Issues
For each issue found: name the exact file + line range, describe the problem, and state the risk level (low/medium/high). Cover: error handling gaps, hardcoded values, security concerns, dead code, and dependency rot.

### §10 ★ Improvement Suggestions
For each suggestion use this exact format:
**[file.py → function_name()]** Current: [what it does now]. Problem: [specific issue]. Fix: [exact library/pattern/approach to use instead]. Impact: [measurable improvement].

Give at least 5 specific, file-level suggestions covering: performance, security, maintainability, and developer experience.

### §11 ★ Value Mining — Market Potential & Practical Applications
- **Core Value:** What does this do that commercial tools charge for? Name a real competitor and compare.
- **Immediate Use Cases:** 3 specific scenarios where someone could deploy this today (be concrete: "a company doing X could use this to automate Y, saving Z hours/week").
- **Market Size:** Name a real market segment this addresses. Give a rough size if knowable.
- **Monetization:** The most viable path to revenue (SaaS / API / consulting / enterprise license) with a specific pricing rationale.
- **Integration Play:** Name 2–3 real platforms (Slack, GitHub Actions, VS Code, etc.) this could plug into and what value each integration adds.

End with a **TL;DR** (3 sentences max): what this project is, its biggest strength, and the single most important next step for whoever owns it.`;
}

export { LANGUAGE_NAMES };
