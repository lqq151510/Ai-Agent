import * as fs from 'fs';
import * as path from 'path';

export function normalizeTreeDepth(value: unknown, fallback = 2): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.trunc(value), 5));
}

export function resolveAuthorizedRoot(
  requestedPath: unknown,
  authorizedRoots: Array<string | null | undefined>,
): string | null {
  const requested = canonicalPath(requestedPath);
  if (!requested) return null;

  for (const rootPath of authorizedRoots) {
    const root = canonicalPath(rootPath);
    if (root === requested) return root;
  }
  return null;
}

export function isPathWithinRoot(candidatePath: unknown, rootPath: unknown): boolean {
  const candidate = canonicalPath(candidatePath);
  const root = canonicalPath(rootPath);
  if (!candidate || !root) return false;

  const relative = path.relative(root, candidate);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function canonicalPath(candidatePath: unknown): string | null {
  if (typeof candidatePath !== 'string' || !candidatePath.trim()) return null;
  const resolved = path.resolve(candidatePath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}
