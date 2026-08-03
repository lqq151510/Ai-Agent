import * as fs from 'fs';
import { inspectWorkspaceEntry, resolveWorkspacePath } from './path-access.js';

export function readTextFileFromResolvedPath(filePath: string, maxBytes: number): { content: string; size: number } {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('path is not a file');
    if (stat.size > maxBytes) throw new Error('file too large');
    return { content: fs.readFileSync(fd, 'utf8'), size: stat.size };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function readTextFileFromWorkspace(root: string, input: unknown, maxBytes: number): { file: ReturnType<typeof resolveWorkspacePath>; content: string; size: number } {
  const file = resolveWorkspacePath(root, input);
  return { file, ...readTextFileFromResolvedPath(file.absolute, maxBytes) };
}

export function listWorkspaceEntries(root: string, directory: string): NonNullable<ReturnType<typeof inspectWorkspaceEntry>>[] {
  let names: string[];
  try {
    names = fs.readdirSync(directory);
  } catch {
    return [];
  }
  return names.flatMap((name): NonNullable<ReturnType<typeof inspectWorkspaceEntry>>[] => {
    const entry = inspectWorkspaceEntry(root, directory, name);
    return entry ? [entry] : [];
  });
}
