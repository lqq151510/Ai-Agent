import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const workspaceRouter = Router();

// Directories to ignore when building the file tree
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  '__pycache__', '.venv', 'venv', 'target', '.gradle',
  'coverage', '.nyc_output', '.cache'
]);

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  size?: number;
}

function buildFileTree(dirPath: string, depth: number, maxDepth: number): FileTreeNode[] {
  if (depth > maxDepth) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileTreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && depth === 0) {
      // Show hidden files only at root? Skip for clarity
      continue;
    }
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: 'directory',
        children: buildFileTree(fullPath, depth + 1, maxDepth),
      });
    } else if (entry.isFile()) {
      let size: number | undefined;
      try {
        size = fs.statSync(fullPath).size;
      } catch { /* ignore */ }
      nodes.push({ name: entry.name, path: fullPath, type: 'file', size });
    }
  }

  // Directories first, then files, each sorted alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

// GET /workspace/tree?path=<dir>&depth=3
workspaceRouter.get('/tree', (req, res) => {
  const dirPath = req.query['path'] as string;
  const parsedDepth = Number.parseInt(req.query['depth'] as string || '3', 10);
  const depth = Number.isFinite(parsedDepth)
    ? Math.max(0, Math.min(parsedDepth, 5))
    : 3;

  if (!dirPath) {
    return res.status(400).json({ error: 'path is required' });
  }

  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return res.status(404).json({ error: 'directory not found' });
  }

  const tree = buildFileTree(resolved, 0, depth);
  return res.json({ path: resolved, tree });
});
