import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { getDataDir } from './utils/env';

const execAsync = util.promisify(exec);

export type WorktreeMode = 'local' | 'worktree';

export type WorktreeInfo = {
  path: string;
  branch: string;
  isActive: boolean;
};

export type WorktreeCreateResult = {
  path: string;
  branch: string;
};

/**
 * Manages Git worktree lifecycle for thread isolation.
 *
 * Each thread can optionally get its own Git worktree (an isolated checkout
 * sharing the same .git/ object store). Worktrees live under
 * <dataDir>/worktrees/<project-hash>/<thread-id>/.
 */
export class WorktreeManager {
  /**
   * Derive a safe branch name from a thread name / id.
   * codex/<sanitized-name>
   */
  public static threadBranchName(threadName: string, threadId: string): string {
    const safe = threadName
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    return `codex/${safe || threadId.slice(0, 8)}`;
  }

  /**
   * Resolve the worktree base directory for a project.
   */
  public static worktreeBaseDir(projectPath: string): string {
    // Use a hash of the absolute project path to keep it stable
    let hash = 0;
    for (let i = 0; i < projectPath.length; i++) {
      const chr = projectPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    const projectHash = Math.abs(hash).toString(36);
    return path.join(getDataDir(), 'worktrees', projectHash);
  }

  constructor() {}

  /**
   * Create a git worktree on a new branch: codex/<thread-name>.
   * Returns the worktree path and branch name, or null if the project is not a git repo.
   */
  public async create(projectPath: string, branchName: string, threadId: string): Promise<WorktreeCreateResult | null> {
    const baseDir = WorktreeManager.worktreeBaseDir(projectPath);
    const worktreePath = path.join(baseDir, threadId);
    const branch = branchName;

    // Ensure the worktree base dir exists
    fs.mkdirSync(baseDir, { recursive: true });

    // Check if branch already exists remotely or locally
    try {
      await execAsync(`git rev-parse --verify "${branch}"`, { cwd: projectPath });
      // Branch exists — check it out in a new worktree
      await execAsync(`git worktree add "${worktreePath}" "${branch}"`, { cwd: projectPath });
    } catch {
      // Branch does not exist — create it from HEAD
      await execAsync(`git worktree add -b "${branch}" "${worktreePath}" HEAD`, { cwd: projectPath });
    }

    console.log(`[worktree] created: ${worktreePath} @ ${branch}`);
    return { path: worktreePath, branch };
  }

  /**
   * Remove a git worktree. Falls back to rm -rf if `git worktree remove` fails.
   */
  public async remove(projectPath: string, worktreePath: string): Promise<void> {
    try {
      await execAsync(`git worktree remove "${worktreePath}"`, { cwd: projectPath });
    } catch {
      // Force remove if the worktree is dirty or git refuses
      try {
        await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: projectPath });
      } catch {
        // Last resort: manual removal
        fs.rmSync(worktreePath, { recursive: true, force: true });
        // Also prune the worktree metadata
        await execAsync('git worktree prune', { cwd: projectPath }).catch(() => {});
      }
    }
    console.log(`[worktree] removed: ${worktreePath}`);
  }

  /**
   * List all worktrees for a project, returning path + branch + active status.
   */
  public async list(projectPath: string): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execAsync('git worktree list', { cwd: projectPath });
      return stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const parts = line.split(/\s+/);
          const wPath = parts[0];
          const branch = parts[1]?.replace(/^\[|\]$/g, '') || '';
          const isActive = parts.includes('(bare)') || line.includes('[HEAD]') === false;
          // The main worktree is always active; detached HEAD or named branch means active
          return { path: wPath, branch, isActive: !line.includes('(detached)') };
        });
    } catch {
      return [];
    }
  }

  /**
   * Prune stale worktree metadata after manual removals.
   */
  public async prune(projectPath: string): Promise<void> {
    try {
      await execAsync('git worktree prune', { cwd: projectPath });
    } catch {
      // Silently ignore
    }
  }

  /**
   * Check whether a directory corresponds to an existing worktree for a project.
   */
  public async exists(projectPath: string, worktreePath: string): Promise<boolean> {
    if (!fs.existsSync(worktreePath)) return false;
    const trees = await this.list(projectPath);
    return trees.some(t => t.path === worktreePath);
  }
}
