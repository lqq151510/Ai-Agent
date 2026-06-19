import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import { type StructuredDiff, parseUnifiedDiff } from './diff-parse';

const execAsync = util.promisify(exec);

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

export class GitManager {
  constructor() {}

  // ==================================================================
  // Read operations (existing + enhanced)
  // ==================================================================

  public async getBranches(projectPath: string) {
    if (!projectPath) return [];
    try {
      const { stdout } = await execAsync('git branch --format="%(refname:short)|%(HEAD)"', { cwd: projectPath });
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
      const { stdout } = await execAsync('git status -s', { cwd: projectPath });
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

  /**
   * Get raw git diff as string (existing behavior).
   */
  public async getDiff(projectPath: string, filePath?: string) {
    if (!projectPath) return '';
    try {
      const cmd = filePath ? `git diff HEAD -- "${filePath}"` : 'git diff HEAD';
      const { stdout } = await execAsync(cmd, { cwd: projectPath });
      return stdout;
    } catch {
      return '';
    }
  }

  /**
   * NEW: Get structured diff (parsed into hunks/lines).
   * Supports scoping to "last turn" changes if worktree tracking is active.
   */
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
      let cmd: string;

      if (options?.lastTurn) {
        // "Last turn" = changes since last commit with a "codex-turn" marker
        // Fallback: use unstaged + staged changes (same as working tree diff)
        cmd = 'git diff --unified=3 --no-color';
      } else if (files.length > 0) {
        const quoted = files.map(f => `"${f}"`).join(' ');
        cmd = `git diff ${baseRef} --unified=3 --no-color -- ${quoted}`;
      } else {
        cmd = `git diff ${baseRef} --unified=3 --no-color`;
      }

      // Also include untracked files that are staged (for completeness)
      const [diffOut, stagedOut] = await Promise.all([
        execAsync(cmd, { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }),
        execAsync('git diff --cached --unified=3 --no-color', { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }).catch(() => ({ stdout: '' })),
      ]);

      const combined = [diffOut.stdout, stagedOut.stdout].filter(Boolean).join('\n');
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
      await execAsync(`git checkout ${branchName}`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  public async createBranch(projectPath: string, branchName: string) {
    if (!projectPath) return false;
    try {
      await execAsync(`git checkout -b ${branchName}`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  // ==================================================================
  // NEW: Stage / Revert operations
  // ==================================================================

  /**
   * Stage an entire file.
   */
  public async stageFile(projectPath: string, file: string): Promise<boolean> {
    if (!projectPath) return false;
    try {
      await execAsync(`git add "${file}"`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Revert (restore) an entire file to HEAD.
   */
  public async revertFile(projectPath: string, file: string): Promise<boolean> {
    if (!projectPath) return false;
    try {
      await execAsync(`git checkout HEAD -- "${file}"`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write patch content to a temp file and apply it via git.
   */
  private async applyPatch(projectPath: string, patchContent: string, args: string): Promise<boolean> {
    const tmpFile = path.join(os.tmpdir(), `codex-patch-${Date.now()}.patch`);
    try {
      fs.writeFileSync(tmpFile, patchContent, 'utf8');
      await execAsync(`git ${args} "${tmpFile}"`, { cwd: projectPath, maxBuffer: 5 * 1024 * 1024 });
      return true;
    } catch {
      return false;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  /**
   * Extract a single hunk from git diff output.
   * Returns { fileHeader, hunkBody } or null if hunkIndex is out of range.
   */
  private extractHunk(fullDiff: string, hunkIndex: number): { fileHeader: string; hunkBody: string } | null {
    const hunkHeaders = fullDiff.match(/^@@.*@@.*$/gm);
    if (!hunkHeaders || hunkIndex < 0 || hunkIndex >= hunkHeaders.length) return null;

    const parts = fullDiff.split(/^@@.*@@.*$/m);
    if (parts.length < hunkIndex + 2) return null;

    const fileHeader = fullDiff.substring(0, fullDiff.indexOf('@@'));
    const hunkBody = hunkHeaders[hunkIndex] + '\n' + parts[hunkIndex + 1].trimStart();
    return { fileHeader, hunkBody };
  }

  /**
   * Stage a specific hunk by index.
   * Extracts the hunk from `git diff`, writes it to a temp patch file,
   * and applies it with `git apply --cached`.
   */
  public async stageHunk(projectPath: string, file: string, hunkIndex: number): Promise<boolean> {
    if (!projectPath) return false;
    try {
      const { stdout: fullDiff } = await execAsync(
        `git diff --unified=3 --no-color -- "${file}"`,
        { cwd: projectPath, maxBuffer: 5 * 1024 * 1024 },
      );
      if (!fullDiff.trim()) return false;

      const extracted = this.extractHunk(fullDiff, hunkIndex);
      if (!extracted) return this.stageFile(projectPath, file);

      const patchContent = extracted.fileHeader + extracted.hunkBody;
      const ok = await this.applyPatch(projectPath, patchContent, 'apply --cached --unidiff-zero');
      if (!ok) return this.stageFile(projectPath, file); // fallback
      return true;
    } catch {
      return this.stageFile(projectPath, file);
    }
  }

  /**
   * Revert a specific hunk by index.
   * Generates a reverse patch (swapping +/-) and applies it.
   */
  public async revertHunk(projectPath: string, file: string, hunkIndex: number): Promise<boolean> {
    if (!projectPath) return false;
    try {
      const { stdout: fullDiff } = await execAsync(
        `git diff --unified=3 --no-color -- "${file}"`,
        { cwd: projectPath, maxBuffer: 5 * 1024 * 1024 },
      );
      if (!fullDiff.trim()) return false;

      const extracted = this.extractHunk(fullDiff, hunkIndex);
      if (!extracted) return false;

      // Reverse: swap + and - lines
      const reversedHunk = extracted.hunkBody
        .split('\n')
        .map(line => {
          if (line.startsWith('+')) return '-' + line.substring(1);
          if (line.startsWith('-')) return '+' + line.substring(1);
          return line;
        })
        .join('\n');

      const patchContent = extracted.fileHeader + reversedHunk;
      return await this.applyPatch(projectPath, patchContent, 'apply --unidiff-zero');
    } catch {
      return false;
    }
  }

  // ==================================================================
  // NEW: Commit / Push / PR
  // ==================================================================

  /**
   * Commit staged changes.
   */
  public async commit(projectPath: string, message: string, options?: { amend?: boolean }): Promise<CommitResult> {
    if (!projectPath) return { success: false, error: 'No project path' };
    try {
      const amendFlag = options?.amend ? ' --amend' : '';
      const { stdout } = await execAsync(
        `git commit${amendFlag} -m "${message.replace(/"/g, '\\"')}"`,
        { cwd: projectPath },
      );
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

  /**
   * Push to remote.
   */
  public async push(projectPath: string, options?: { remote?: string; branch?: string; force?: boolean }): Promise<CommitResult> {
    if (!projectPath) return { success: false, error: 'No project path' };
    try {
      const remote = options?.remote ?? 'origin';
      const branch = options?.branch ?? (await this.getCurrentBranch(projectPath)) ?? 'main';
      const forceFlag = options?.force ? ' --force' : '';
      const { stdout } = await execAsync(
        `git push${forceFlag} "${remote}" "${branch}"`,
        { cwd: projectPath },
      );
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Create a Pull Request using gh CLI.
   * Requires `gh` to be installed and authenticated.
   */
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
      const bodyFlag = options.body ? ` --body "${options.body.replace(/"/g, '\\"')}"` : '';

      const { stdout } = await execAsync(
        `gh pr create --base "${base}" --head "${head}" --title "${options.title.replace(/"/g, '\\"')}"${bodyFlag}`,
        { cwd: projectPath },
      );

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
