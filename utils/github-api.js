/**
 * GitHub REST API utilities
 * Handles all data collection from GitHub without requiring authentication
 * (60 req/hr unauthenticated, 5000/hr with token)
 */

const GITHUB_API_BASE = 'https://api.github.com';

// Files worth reading for context (sampled, not entire codebase)
const PRIORITY_FILES = [
  'README.md', 'readme.md', 'README.rst',
  'package.json', 'pyproject.toml', 'setup.py', 'setup.cfg', 'Cargo.toml',
  'requirements.txt', 'go.mod', 'pom.xml', 'build.gradle',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.github/workflows',
  'CONTRIBUTING.md', 'ARCHITECTURE.md', 'docs/README.md'
];

// Extensions to consider as source code
const SOURCE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java',
  '.cpp', '.c', '.cs', '.rb', '.php', '.swift', '.kt', '.scala',
  '.vue', '.svelte', '.html', '.css', '.scss'
]);

// Directories to skip (noise)
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.pytest_cache',
  'dist', 'build', '.next', 'target', 'vendor', 'venv', '.venv',
  'coverage', '.nyc_output', 'tmp', 'temp', 'logs'
]);

/**
 * Build headers for GitHub API requests, optionally with token
 */
function buildHeaders(token) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RepoInsight-AI-Extension'
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  return headers;
}

/**
 * Fetch with error handling
 */
async function githubFetch(url, token) {
  const response = await fetch(url, { headers: buildHeaders(token) });
  if (response.status === 403) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining === '0') {
      throw new Error('GitHub API rate limit exceeded. Add a GitHub token in settings to increase the limit.');
    }
  }
  if (response.status === 404) {
    throw new Error(`Not found: ${url}`);
  }
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get core repository metadata
 */
export async function getRepoMetadata(owner, repo, token) {
  return githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, token);
}

/**
 * Get language breakdown
 */
export async function getLanguages(owner, repo, token) {
  return githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/languages`, token);
}

/**
 * Get topics/tags
 */
export async function getTopics(owner, repo, token) {
  const data = await githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/topics`, token);
  return data.names || [];
}

/**
 * Get full recursive file tree (up to GitHub's limit)
 */
export async function getFileTree(owner, repo, token) {
  // Get default branch SHA
  const repoData = await githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, token);
  const branch = repoData.default_branch;
  const branchData = await githubFetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${branch}`,
    token
  );
  const treeSha = branchData.commit.commit.tree.sha;

  // Get recursive tree
  const treeData = await githubFetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    token
  );

  return {
    tree: treeData.tree || [],
    truncated: treeData.truncated || false,
    branch
  };
}

/**
 * Get content of a single file (returns decoded string or null)
 */
export async function getFileContent(owner, repo, path, token) {
  try {
    const data = await githubFetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      token
    );
    if (data.encoding === 'base64' && data.content) {
      return atob(data.content.replace(/\n/g, ''));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get recent commits summary
 */
export async function getRecentCommits(owner, repo, token) {
  try {
    const commits = await githubFetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=10`,
      token
    );
    return commits.map(c => ({
      message: c.commit.message.split('\n')[0], // First line only
      date: c.commit.author.date,
      author: c.commit.author.name
    }));
  } catch {
    return [];
  }
}

/**
 * Check for open issues count
 */
export async function getIssueStats(owner, repo, token) {
  try {
    const repoData = await githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, token);
    return {
      open_issues: repoData.open_issues_count,
      forks: repoData.forks_count,
      stars: repoData.stargazers_count,
      watchers: repoData.watchers_count
    };
  } catch {
    return null;
  }
}

/**
 * Main data collection orchestrator.
 * Collects everything needed for a comprehensive analysis.
 * Respects context limits by sampling files intelligently.
 */
export async function collectRepoContext(owner, repo, token) {
  const [metadata, languages, topics, treeResult, recentCommits] = await Promise.all([
    getRepoMetadata(owner, repo, token),
    getLanguages(owner, repo, token),
    getTopics(owner, repo, token),
    getFileTree(owner, repo, token),
    getRecentCommits(owner, repo, token)
  ]);

  const { tree, truncated, branch } = treeResult;

  // Build directory structure summary
  const dirs = new Set();
  const files = [];
  const sourceFiles = [];
  const testFiles = [];

  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const parts = item.path.split('/');

    // Skip noise directories
    if (parts.some(p => SKIP_DIRS.has(p))) continue;

    // Track directories (top 2 levels only)
    if (parts.length > 1) dirs.add(parts[0]);
    if (parts.length > 2) dirs.add(`${parts[0]}/${parts[1]}`);

    const ext = '.' + item.path.split('.').pop();
    const isTest = item.path.includes('test') || item.path.includes('spec') || item.path.includes('__tests__');

    files.push(item.path);
    if (SOURCE_EXTENSIONS.has(ext)) {
      if (isTest) testFiles.push(item.path);
      else sourceFiles.push(item.path);
    }
  }

  // Fetch priority files content
  const fileContents = {};

  // Always try priority files first
  const priorityFetches = PRIORITY_FILES.map(async (p) => {
    const content = await getFileContent(owner, repo, p, token);
    if (content) fileContents[p] = content.slice(0, 3000); // Cap at 3000 chars
  });
  await Promise.all(priorityFetches);

  // Sample a few key source files (main/index/app/server)
  const entryPointCandidates = sourceFiles.filter(f => {
    const name = f.split('/').pop().toLowerCase();
    return ['main', 'index', 'app', 'server', 'cli', 'run', '__main__'].some(e => name.startsWith(e));
  }).slice(0, 5);

  for (const ep of entryPointCandidates) {
    if (!fileContents[ep]) {
      const content = await getFileContent(owner, repo, ep, token);
      if (content) fileContents[ep] = content.slice(0, 2000);
    }
  }

  return {
    metadata: {
      full_name: metadata.full_name,
      description: metadata.description,
      homepage: metadata.homepage,
      stars: metadata.stargazers_count,
      forks: metadata.forks_count,
      open_issues: metadata.open_issues_count,
      license: metadata.license?.name || 'None specified',
      created_at: metadata.created_at,
      updated_at: metadata.updated_at,
      default_branch: branch,
      size_kb: metadata.size
    },
    languages,
    topics,
    structure: {
      total_files: files.length,
      source_files_count: sourceFiles.length,
      test_files_count: testFiles.length,
      directories: Array.from(dirs).slice(0, 50),
      sample_source_files: sourceFiles.slice(0, 30),
      test_files: testFiles.slice(0, 20),
      tree_truncated: truncated
    },
    file_contents: fileContents,
    recent_commits: recentCommits
  };
}
