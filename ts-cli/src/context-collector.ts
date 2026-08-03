import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CONTEXT_CHAR_LIMIT = 50000;
const FILE_CHAR_LIMIT = 20000;
const REDACT_LINE = /(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie)/i;
const LOCAL_SERVICE_URL = process.env.LOCAL_SERVICE_URL;
const LOCAL_SERVICE_TOKEN = process.env.LOCAL_SERVICE_TOKEN || '';

function sanitizeText(input: string): string {
  let output = input.replace(/\r\n/g, '\n');
  output = output.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]');
  output = output.replace(/sk-[A-Za-z0-9]+/g, 'sk-[redacted]');
  output = output
    .split('\n')
    .map(line => (REDACT_LINE.test(line) ? '[redacted sensitive line]' : line))
    .join('\n');
  output = output.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
  output = output.replace(/\n{3,}/g, '\n\n').trim();
  return output;
}

async function safeExec(command: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: process.cwd(),
      timeout: 1500,
      maxBuffer: 64 * 1024,
    });
    return sanitizeText(stdout).trim();
  } catch {
    return '';
  }
}

function readWhitelistedFile(fullPath: string): string {
  if (!existsSync(fullPath)) {
    return '';
  }
  try {
    const content = sanitizeText(readFileSync(fullPath, 'utf8'));
    return content.slice(0, FILE_CHAR_LIMIT);
  } catch {
    return '';
  }
}

async function collectFromLocalService(): Promise<string | undefined> {
  if (!LOCAL_SERVICE_URL) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const headers: Record<string, string> = {};
    if (LOCAL_SERVICE_TOKEN) {
      headers['Authorization'] = `Bearer ${LOCAL_SERVICE_TOKEN}`;
    }
    const response = await fetch(`${LOCAL_SERVICE_URL}/context`, { signal: controller.signal, headers });
    if (!response.ok) {
      return undefined;
    }
    const payload = await response.json() as { context?: string };
    const context = typeof payload.context === 'string' ? sanitizeText(payload.context) : '';
    return context ? context.slice(0, CONTEXT_CHAR_LIMIT) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectSystemContext(): Promise<string | undefined> {
  const localServiceContext = await collectFromLocalService();
  if (localServiceContext) {
    return localServiceContext;
  }

  const sections: string[] = [];
  sections.push(`Current time: ${new Date().toISOString()}`);

  const [gitRoot, gitStatus, recentCommits] = await Promise.all([
    safeExec('git', ['rev-parse', '--show-toplevel']),
    safeExec('git', ['--no-optional-locks', 'status', '--short']),
    safeExec('git', ['--no-optional-locks', 'log', '--oneline', '-n', '5'])
  ]);

  if (gitStatus) {
    sections.push(`Git status:\n${gitStatus.split('\n').slice(0, 20).join('\n')}`);
  }
  if (recentCommits) {
    sections.push(`Recent commits:\n${recentCommits}`);
  }

  // Codex Context Cascading: Read AGENTS.md from git root down to CWD
  const cwd = process.cwd();
  const root = gitRoot || cwd;
  
  // Build paths from root to cwd
  const pathsToCheck: string[] = [];
  if (cwd.startsWith(root)) {
    const relative = cwd.slice(root.length);
    const parts = relative.split(sep).filter(Boolean);
    let current = root;
    pathsToCheck.push(current);
    for (const part of parts) {
      current = resolve(current, part);
      pathsToCheck.push(current);
    }
  } else {
    pathsToCheck.push(cwd);
  }

  // Collect AGENTS.md and AGENTS.override.md
  for (const dir of pathsToCheck) {
    const agentsMd = readWhitelistedFile(resolve(dir, 'AGENTS.md'));
    if (agentsMd) {
      sections.push(`File context (AGENTS.md in ${dir}):\n${agentsMd}`);
    }
    const agentsOverrideMd = readWhitelistedFile(resolve(dir, 'AGENTS.override.md'));
    if (agentsOverrideMd) {
      sections.push(`File context (AGENTS.override.md in ${dir}):\n${agentsOverrideMd}`);
    }
  }

  // Fallback files for legacy support
  for (const file of ['README.md', '.cursorrules', '.agentrules']) {
    const snippet = readWhitelistedFile(resolve(cwd, file));
    if (snippet) {
      sections.push(`File context (${file}):\n${snippet}`);
    }
  }

  const merged = sanitizeText(sections.join('\n\n'));
  if (!merged) {
    return undefined;
  }
  return merged.slice(0, CONTEXT_CHAR_LIMIT);
}
