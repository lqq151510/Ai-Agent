import { execFile } from 'child_process';
import { Router } from 'express';
import * as path from 'path';
import { promisify } from 'util';
import { listWorkspaceEntries, readTextFileFromWorkspace } from '../file-access.js';
import { isWithinRoot, resolveWorkspacePath, toRelative } from '../path-access.js';

const execFileAsync = promisify(execFile);
const CONTEXT_CHAR_LIMIT = 50_000;
const FILE_CHAR_LIMIT = 8_000;
const FILE_BATCH_LIMIT = 5;
const MAX_FILE_BYTES = 200 * 1024;
const TREE_MAX_DEPTH = 2;
const TREE_MAX_NODES = 500;
const REDACT_LINE_RE = /(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie)/i;
const TREE_IGNORE = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '__pycache__', '.venv', 'venv', 'coverage', '.cache', '.nyc_output']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico', '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar', '.exe', '.dll', '.so', '.dylib', '.mp3', '.mp4', '.mov', '.avi', '.woff', '.woff2', '.ttf', '.eot', '.jar', '.class']);

function sanitize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]').replace(/sk-[A-Za-z0-9]+/g, 'sk-[redacted]')
    .split('\n').map(line => (REDACT_LINE_RE.test(line) ? '[redacted sensitive line]' : line)).join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

async function safeExec(command: string, args: string[], cwd: string): Promise<string> {
  try { return sanitize((await execFileAsync(command, args, { cwd, timeout: 3000, maxBuffer: 64 * 1024 })).stdout).trim(); } catch { return ''; }
}

function preview(root: string, relativePath: unknown) {
  const read = readTextFileFromWorkspace(root, relativePath, MAX_FILE_BYTES);
  const ext = path.extname(read.file.absolute).toLowerCase();
  if (BINARY_EXT.has(ext)) throw new Error('binary file type not supported');
  const content = sanitize(read.content).slice(0, FILE_CHAR_LIMIT);
  return { path: read.file.relative, name: path.basename(read.file.absolute), content, truncated: content.length >= FILE_CHAR_LIMIT };
}

function treeLines(root: string, directory: string, level: number, state: { nodes: number; visited: Set<string> }): string[] {
  if (level > TREE_MAX_DEPTH || state.nodes >= TREE_MAX_NODES || state.visited.has(directory)) return [];
  state.visited.add(directory);
  const lines: string[] = [];
  for (const entry of listWorkspaceEntries(root, directory)) {
    if (state.nodes >= TREE_MAX_NODES) break;
    const name = entry.name;
    if (TREE_IGNORE.has(name) || (level === 0 && name.startsWith('.'))) continue;
    state.nodes += 1;
    const indent = '  '.repeat(level);
    if (entry.isDirectory) {
      lines.push(`${indent}${name}/`);
      lines.push(...treeLines(root, entry.absolute, level + 1, state));
    } else {
      lines.push(`${indent}${name}`);
    }
  }
  return lines;
}

export function createContextRouter(root: string, _options: { treeMaxDepth?: number; treeMaxNodes?: number } = {}): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    if (Object.hasOwn(req.query, 'path')) return res.status(400).json({ error: 'context path is fixed to the startup workspace' });
    const sections = ['Workspace: .', `Time: ${new Date().toISOString()}`];
    const [gitRoot, gitStatus, recentCommits, currentBranch] = await Promise.all([
      safeExec('git', ['rev-parse', '--show-toplevel'], root), safeExec('git', ['--no-optional-locks', 'status', '--short'], root),
      safeExec('git', ['--no-optional-locks', 'log', '--oneline', '-n', '5'], root), safeExec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root),
    ]);
    if (currentBranch) sections.push(`Git branch: ${currentBranch}`);
    if (gitStatus) sections.push(`Git status:\n${gitStatus.split('\n').slice(0, 20).join('\n')}`);
    if (recentCommits) sections.push(`Recent commits:\n${recentCommits}`);
    const canonicalGitRoot = gitRoot && isWithinRoot(root, gitRoot) ? gitRoot : root;
    const dirs = [canonicalGitRoot];
    const relative = path.relative(canonicalGitRoot, root);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      let current = canonicalGitRoot;
      for (const part of relative.split(path.sep)) { current = path.join(current, part); dirs.push(current); }
    }
    for (const directory of dirs) {
      for (const filename of ['AGENTS.md', 'AGENTS.local.md', 'AGENTS.override.md', 'README.md']) {
          try {
            const read = readTextFileFromWorkspace(root, path.relative(root, path.join(directory, filename)), FILE_CHAR_LIMIT * 1024);
            const content = sanitize(read.content).slice(0, FILE_CHAR_LIMIT);
            if (content) sections.push(`[${filename} @ ${toRelative(root, directory)}]:\n${content}`);
          } catch { /* Ignore inaccessible optional context files. */ }
      }
    }
    const tree = treeLines(root, root, 0, { nodes: 0, visited: new Set() }).join('\n');
    if (tree) sections.push(`File tree:\n${tree}`);
    return res.json({ context: sections.join('\n\n').slice(0, CONTEXT_CHAR_LIMIT), workspacePath: '.' });
  });
  router.post('/files', (req, res) => {
    const paths = req.body?.paths;
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > FILE_BATCH_LIMIT) return res.status(400).json({ error: `paths must contain 1-${FILE_BATCH_LIMIT} entries` });
    try {
      const files = paths.map((entry: unknown) => preview(root, entry));
      return res.json({ files, requested: paths.length, returned: files.length, maxFiles: FILE_BATCH_LIMIT });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'invalid path batch' });
    }
  });
  return router;
}
