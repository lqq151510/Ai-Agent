import { Router } from 'express';
import { execFile } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { extname, resolve, sep, basename } from 'path';
import { promisify } from 'util';

export const contextRouter = Router();

const execFileAsync = promisify(execFile);

const CONTEXT_CHAR_LIMIT = 50_000;
const FILE_CHAR_LIMIT = 8_000;
const FILE_BATCH_LIMIT = 5;
const MAX_FILE_BYTES = 200 * 1024;
const REDACT_LINE_RE = /(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie)/i;
const TREE_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  '__pycache__', '.venv', 'venv', 'coverage', '.cache', '.nyc_output',
]);
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.mov', '.avi',
  '.woff', '.woff2', '.ttf', '.eot',
  '.jar', '.class',
]);

function sanitize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9]+/g, 'sk-[redacted]')
    .split('\n')
    .map(line => (REDACT_LINE_RE.test(line) ? '[redacted sensitive line]' : line))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

async function safeExec(cmd: string, args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 3000, maxBuffer: 64 * 1024 });
    return sanitize(stdout).trim();
  } catch {
    return '';
  }
}

function readFileSafe(filePath: string): string {
  if (!existsSync(filePath)) return '';
  try {
    return sanitize(readFileSync(filePath, 'utf8')).slice(0, FILE_CHAR_LIMIT);
  } catch {
    return '';
  }
}

function treeLines(dir: string, depth: number, maxDepth: number): string[] {
  if (depth > maxDepth) return [];
  const lines: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (TREE_IGNORE.has(e.name) || (e.name.startsWith('.') && depth === 0)) continue;
      const indent = '  '.repeat(depth);
      if (e.isDirectory()) {
        lines.push(`${indent}${e.name}/`);
        lines.push(...treeLines(resolve(dir, e.name), depth + 1, maxDepth));
      } else {
        lines.push(`${indent}${e.name}`);
      }
    }
  } catch { /* ignore unreadable dirs */ }
  return lines;
}

function readFilePreview(filePath: string): {
  path: string;
  name: string;
  content: string;
  truncated: boolean;
} | null {
  const resolved = resolve(filePath);
  const ext = extname(resolved).toLowerCase();
  if (!existsSync(resolved) || BINARY_EXT.has(ext)) return null;

  try {
    const stat = statSync(resolved);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;

    const content = sanitize(readFileSync(resolved, 'utf8')).slice(0, FILE_CHAR_LIMIT);
    return {
      path: resolved,
      name: basename(resolved),
      content,
      truncated: content.length >= FILE_CHAR_LIMIT,
    };
  } catch {
    return null;
  }
}

// GET /context?path=<workspace-dir>
contextRouter.get('/', async (req, res) => {
  const workspacePath = req.query['path'] as string;

  if (!workspacePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  const cwd = resolve(workspacePath);
  const sections: string[] = [];

  sections.push(`Workspace: ${cwd}`);
  sections.push(`Time: ${new Date().toISOString()}`);

  // --- Git info ---
  const [gitRoot, gitStatus, recentCommits, currentBranch] = await Promise.all([
    safeExec('git', ['rev-parse', '--show-toplevel'], cwd),
    safeExec('git', ['--no-optional-locks', 'status', '--short'], cwd),
    safeExec('git', ['--no-optional-locks', 'log', '--oneline', '-n', '5'], cwd),
    safeExec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
  ]);

  if (currentBranch) sections.push(`Git branch: ${currentBranch}`);
  if (gitStatus) sections.push(`Git status:\n${gitStatus.split('\n').slice(0, 20).join('\n')}`);
  if (recentCommits) sections.push(`Recent commits:\n${recentCommits}`);

  // --- AGENTS.md cascade (git root → cwd) ---
  const root = gitRoot || cwd;
  const pathsToCheck: string[] = [root];
  if (cwd.startsWith(root) && cwd !== root) {
    const relative = cwd.slice(root.length);
    const parts = relative.split(sep).filter(Boolean);
    let current = root;
    for (const part of parts) {
      current = resolve(current, part);
      pathsToCheck.push(current);
    }
  }

  for (const dir of pathsToCheck) {
    for (const fname of ['AGENTS.md', 'AGENTS.local.md', 'AGENTS.override.md', 'README.md']) {
      const content = readFileSafe(resolve(dir, fname));
      if (content) sections.push(`[${fname} @ ${dir}]:\n${content}`);
    }
  }

  // --- File tree (top 2 levels) ---
  const tree = treeLines(cwd, 0, 2).join('\n');
  if (tree) sections.push(`File tree:\n${tree}`);

  const merged = sections.join('\n\n').slice(0, CONTEXT_CHAR_LIMIT);
  return res.json({ context: merged, workspacePath: cwd });
});

contextRouter.post('/files', (req, res) => {
  const input = Array.isArray(req.body?.paths) ? req.body.paths : [];
  const previews = input
    .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, FILE_BATCH_LIMIT)
    .map((value: string) => readFilePreview(value))
    .filter((value: ReturnType<typeof readFilePreview>): value is NonNullable<ReturnType<typeof readFilePreview>> => value !== null);

  return res.json({
    files: previews,
    requested: input.length,
    returned: previews.length,
    maxFiles: FILE_BATCH_LIMIT,
  });
});
