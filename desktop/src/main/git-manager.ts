import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import { type StructuredDiff, parseUnifiedDiff } from './diff-parse';

const execFileAsync = util.promisify(execFile);

export type { StructuredDiff };

export type CommitResult = {
  success: boolean;
  commitHash?: string;
  error?: string;
};

export type PrResult = {
  success: boolean;
  url?: string;
  error?: string;
};

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

/** Run a git command with argument array (no shell, no injection). */
async function runGit(args: string[], options: { cwd: string; maxBuffer?: number }): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: options.cwd,
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
  });
  return stdout;
}

/** Run a gh command with argument array (no shell, no injection). */
async function runGh(args: string[], options: { cwd: string; maxBuffer?: number }): Promise<string> {
  const { stdout } = await execFileAsync('gh', args, {
    cwd: options.cwd,
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
  });
  return stdout;
}

export class GitManager {
  constructor() {}

  // ==================================================================
  // Read operations
  // ==================================================================

  public async getBranches(projectPath: string) {
    if (!projectPath) return [];
    try {
      const stdout = await runGit(['branch', '--format=%(refname:short)|%(HEAD)'], { cwd: projectPath });
      const branches = stdout.trim().split('\n').filter(b => b.length > 0).map(line => {
        const [name, isCurrent] = line.split('|');
        return {
          name,
          isCurrent: isCurrent === '*',
        };
      });
      return branches;
    } catch {
      return [];
    }
  }

  public async getCurrentBranch(projectPath: string) {
    const branches = await this.getBranches(projectPath);
    return branches.find(b => b.isCurrent)?.name || null;
  }

  public async getStatus(projectPath: string) {
    if (!projectPath) return [];
    try {
      const stdout = await runGit(['status', '-s'], { cwd: projectPath });
      const files = stdout.trim().split('\n').filter(line => line.length > 0).map(line => {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        return { file, status: status.trim() };
      });
      return files;
    } catch {
      return [];
    }
  }

  public async getDiff(projectPath: string, filePath?: string) {
    if (!projectPath) return '';
    try {
      const args = filePath
        ? ['diff', 'HEAD', '--', filePath]
        : ['diff', 'HEAD'];
      return await runGit(args, { cwd: projectPath });
    } catch {
      return '';
    }
  }

  public async getStructuredDiff(
    projectPath: string,
    options?: {
      baseRef?: string;
      lastTurn?: boolean;
      fileFilter?: string[];
    },
  ): Promise<StructuredDiff[]> {
    if (!projectPath) return [];

    const baseRef = options?.baseRef ?? 'HEAD';
    const files = options?.fileFilter?.length ? options.fileFilter : [];

    try {
      const diffArgs: string[] = options?.lastTurn
        ? ['diff', '--unified=3', '--no-color']
        : files.length > 0
          ? ['diff', baseRef, '--unified=3', '--no-color', '--', ...files]
          : ['diff', baseRef, '--unified=3', '--no-color'];

      const [diffOut, stagedOut] = await Promise.all([
        runGit(diffArgs, { cwd: projectPath }),
        runGit(['diff', '--cached', '--unified=3', '--no-color'], { cwd: projectPath }).catch(() => ''),
      ]);

      const combined = [diffOut, stagedOut].filter(Boolean).join('\n');
      return parseUnifiedDiff(combined);
    } catch {
      return [];
    }
  }

  // ==================================================================
  // Branch operations
  // ==================================================================

  public async checkoutBranch(projectPath: string, branchName: string) {
    if (!projectPath) return false;
    try {
      await runGit(['checkout', branchName], { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  public async createBranch(projectPath: string, branchName: string) {
    if (!projectPath) return false;
    try {
      await runGit(['checkout', '-b', branchName], { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  // ==================================================================
  // Stage / Revert operations
  // ==================================================================

  public async stageFile(projectPath: string, file: string): Promise<boolean> {
    if (!projectPath) return false;
    try {
      await runGit(['add', '--', file], { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  public async revertFile(projectPath: string, file: string): Promise<boolean> {
    if (!projectPath) return false;
    try {
      await runGit(['checkout', 'HEAD', '--', file], { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  private async applyPatch(projectPath: string, patchContent: string, args: string[]): Promise<boolean> {
    const tmpFile = path.join(os.tmpdir(), `codex-patch-${Date.now()}.patch`);
    try {
      fs.writeFileSync(tmpFile, patchContent, 'utf8');
      await runGit([...args, tmpFile], { cwd: projectPath, maxBuffer: 5 * 1024 * 1024 });
      return true;
    } catch {
      return false;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  private extractHunk(fullDiff: string, hunkIndex: number): { fileHeader: string; hunkBody: string } | null {
    const hunkHeaders = fullDiff.match(/^@@.*@@.*$/gm);
    if (!hunkHeaders || hunkIndex < 0 || hunkIndex >= hunkHeaders.length) return null;

    const parts = fullDiff.split(/^@@.*@@.*$/m);
    if (parts.length < hunkIndex + 2) return null;

    const fileHeader = fullDiff.substring(0, fullDiff.indexOf('@@'));
    const hunkBody = hunkHeaders[hunkIndex] + '\n' + parts[hunkIndex + 1].trimStart();
    return { fileHeader, hunkBody };
  }

  public async stageHunk(projectPath: string, file: string, hunkIndex: number): Promise<boolean> {
    if (!projectPath) return false;
    try {
      const fullDiff = await runGit(['diff', '--unified=3', '--no-color', '--', file], {
        cwd: projectPath,
        maxBuffer: 5 * 1024 * 1024,
      });
      if (!fullDiff.trim()) return false;

      const extracted = this.extractHunk(fullDiff, hunkIndex);
      if (!extracted) return this.stageFile(projectPath, file);

      const patchContent = extracted.fileHeader + extracted.hunkBody;
      const ok = await this.applyPatch(projectPath, patchContent, ['apply', '--cached', '--unidiff-zero']);
      if (!ok) return this.stageFile(projectPath, file);
      return true;
    } catch {
      return this.stageFile(projectPath, file);
    }
  }

  public async revertHunk(projectPath: string, file: string, hunkIndex: number): Promise<boolean> {
    if (!projectPath) return false;
    try {
      const fullDiff = await runGit(['diff', '--unified=3', '--no-color', '--', file], {
        cwd: projectPath,
        maxBuffer: 5 * 1024 * 1024,
      });
      if (!fullDiff.trim()) return false;

      const extracted = this.extractHunk(fullDiff, hunkIndex);
      if (!extracted) return false;

      const reversedHunk = extracted.hunkBody
        .split('\n')
        .map(line => {
          if (line.startsWith('+')) return '-' + line.substring(1);
          if (line.startsWith('-')) return '+' + line.substring(1);
          return line;
        })
        .join('\n');

      const patchContent = extracted.fileHeader + reversedHunk;
      return await this.applyPatch(projectPath, patchContent, ['apply', '--unidiff-zero']);
    } catch {
      return false;
    }
  }

  // ==================================================================
  // Commit / Push / PR
  // ==================================================================

  public async commit(projectPath: string, message: string, options?: { amend?: boolean }): Promise<CommitResult> {
    if (!projectPath) return { success: false, error: 'No project path' };
    try {
      const args = ['commit', '-m', message];
      if (options?.amend) args.push('--amend');
      const stdout = await runGit(args, { cwd: projectPath });
      const hashMatch = stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
      return {
        success: true,
        commitHash: hashMatch?.[1] || undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async push(projectPath: string, options?: { remote?: string; branch?: string; force?: boolean }): Promise<CommitResult> {
    if (!projectPath) return { success: false, error: 'No project path' };
    try {
      const remote = options?.remote ?? 'origin';
      const branch = options?.branch ?? (await this.getCurrentBranch(projectPath)) ?? 'main';
      const args = ['push'];
      if (options?.force) args.push('--force');
      args.push(remote, branch);
      await runGit(args, { cwd: projectPath });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async createPullRequest(projectPath: string, options: {
    title: string;
    body?: string;
    base?: string;
    head?: string;
  }): Promise<PrResult> {
    if (!projectPath) return { success: false, error: 'No project path' };

    try {
      const head = options.head ?? (await this.getCurrentBranch(projectPath)) ?? 'HEAD';
      const base = options.base ?? 'main';
      const args = ['pr', 'create', '--base', base, '--head', head, '--title', options.title];
      if (options.body) args.push('--body', options.body);

      const stdout = await runGh(args, { cwd: projectPath });

      return {
        success: true,
        url: stdout.trim(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
