import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { listWorkspaceEntries } from '../file-access.js';
import { resolveWorkspacePath, toRelative } from '../path-access.js';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__', '.venv', 'venv', 'target', '.gradle', 'coverage', '.nyc_output', '.cache']);
interface FileTreeNode { name: string; path: string; type: 'file' | 'directory'; children?: FileTreeNode[]; size?: number; }

export function createWorkspaceRouter(root: string, options: { treeMaxDepth?: number; treeMaxNodes?: number } = {}): Router {
  const router = Router();
  const maxDepth = options.treeMaxDepth ?? 5;
  const maxNodes = options.treeMaxNodes ?? 2_000;
  router.get('/tree', (req, res) => {
    let start;
    try { start = resolveWorkspacePath(root, req.query.path); } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'invalid path' });
    }
    if (!fs.statSync(start.absolute).isDirectory()) return res.status(400).json({ error: 'path is not a directory' });
    const requestedDepth = Number.parseInt(String(req.query.depth ?? '3'), 10);
    const depth = Number.isFinite(requestedDepth) ? Math.max(0, Math.min(requestedDepth, maxDepth)) : 3;
    const state = { nodes: 0, truncated: false, visited: new Set<string>() };
    return res.json({ path: start.relative, tree: buildTree(root, start.absolute, 0, depth, maxNodes, state), truncated: state.truncated });
  });
  return router;
}

function buildTree(root: string, directory: string, level: number, maxDepth: number, maxNodes: number, state: { nodes: number; truncated: boolean; visited: Set<string> }): FileTreeNode[] {
  if (level > maxDepth || state.visited.has(directory)) return [];
  state.visited.add(directory);
  const nodes: FileTreeNode[] = [];
  for (const entry of listWorkspaceEntries(root, directory)) {
    if (state.nodes >= maxNodes) { state.truncated = true; break; }
    const name = entry.name;
    if ((level === 0 && name.startsWith('.')) || IGNORED_DIRS.has(name)) continue;
    state.nodes += 1;
    if (entry.isDirectory) {
      nodes.push({ name, path: toRelative(root, entry.absolute), type: 'directory', children: buildTree(root, entry.absolute, level + 1, maxDepth, maxNodes, state) });
    } else {
      nodes.push({ name, path: toRelative(root, entry.absolute), type: 'file', size: entry.size });
    }
  }
  nodes.sort((a, b) => a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name));
  return nodes;
}
