import * as fs from 'fs';
import * as path from 'path';

export interface WorkspacePath {
  absolute: string;
  relative: string;
}

export interface WorkspaceEntry extends WorkspacePath {
  name: string;
  isDirectory: boolean;
  size: number;
}

export function resolveWorkspaceRoot(workspaceRoot: string | undefined): string {
  if (!workspaceRoot || workspaceRoot.includes('\0')) {
    throw new Error('LOCAL_SERVICE_WORKSPACE_ROOT is required');
  }

  let root: string;
  try {
    root = fs.realpathSync(workspaceRoot);
  } catch {
    throw new Error('LOCAL_SERVICE_WORKSPACE_ROOT must reference an existing directory');
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new Error('LOCAL_SERVICE_WORKSPACE_ROOT must reference a directory');
  }
  return root;
}

export function resolveWorkspacePath(root: string, input: unknown): WorkspacePath {
  if (typeof input !== 'string' || !input.trim() || input.includes('\0') || path.isAbsolute(input)) {
    throw new Error('path must be a non-empty workspace-relative path');
  }

  const requested = path.resolve(root, input);
  assertWithinRoot(root, requested);
  const parts = path.relative(root, requested).split(path.sep);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part || part === '.') continue;
    current = path.join(current, part);
    let lstat: fs.Stats;
    try {
      lstat = fs.lstatSync(current);
    } catch {
      throw new Error('path does not exist');
    }
    const isFinal = index === parts.length - 1;
    if (lstat.isSymbolicLink() && !isFinal) {
      throw new Error('path contains a symlink directory');
    }
  }

  let canonical: string;
  try {
    canonical = fs.realpathSync(current);
  } catch {
    throw new Error('path does not exist');
  }
  assertWithinRoot(root, canonical);
  const stat = fs.statSync(canonical);
  if (stat.isDirectory() && fs.lstatSync(current).isSymbolicLink()) {
    throw new Error('path contains a symlink directory');
  }
  return { absolute: canonical, relative: toRelative(root, canonical) };
}

export function inspectWorkspaceEntry(root: string, parent: string, name: string): WorkspaceEntry | undefined {
  const requested = path.join(parent, name);
  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(requested);
  } catch {
    return undefined;
  }
  let resolved: WorkspacePath;
  try {
    resolved = resolveWorkspacePath(root, path.relative(root, requested));
  } catch {
    return undefined;
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved.absolute);
  } catch {
    return undefined;
  }
  if (lstat.isSymbolicLink() && stat.isDirectory()) return undefined;
  if (!stat.isFile() && !stat.isDirectory()) return undefined;
  return { ...resolved, name, isDirectory: stat.isDirectory(), size: stat.size };
}

export function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function toRelative(root: string, candidate: string): string {
  const relative = path.relative(root, candidate);
  return relative || '.';
}

function assertWithinRoot(root: string, candidate: string): void {
  if (!isWithinRoot(root, candidate)) {
    throw new Error('path is outside the workspace');
  }
}
