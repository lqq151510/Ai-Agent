import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CONTEXT_CHAR_LIMIT = 1500;
const FILE_CHAR_LIMIT = 800;
const FILES_TO_CHECK = ['AGENTS.md', 'README.md', '.cursorrules', '.agentrules'];
const REDACT_LINE = /(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie)/i;

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

function readWhitelistedFile(file: string): string {
  const fullPath = resolve(process.cwd(), file);
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

export async function collectSystemContext(): Promise<string | undefined> {
  const sections: string[] = [];
  sections.push(`Current time: ${new Date().toISOString()}`);

  const [gitStatus, recentCommits] = await Promise.all([
    safeExec('git', ['--no-optional-locks', 'status', '--short']),
    safeExec('git', ['--no-optional-locks', 'log', '--oneline', '-n', '5'])
  ]);

  if (gitStatus) {
    sections.push(`Git status:\n${gitStatus.split('\n').slice(0, 20).join('\n')}`);
  }

  if (recentCommits) {
    sections.push(`Recent commits:\n${recentCommits}`);
  }

  for (const file of FILES_TO_CHECK) {
    const snippet = readWhitelistedFile(file);
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
