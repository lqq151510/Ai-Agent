import { exec } from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(exec);

export class GitManager {
  constructor() {}

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
    } catch (e) {
      console.log('Not a git repository or git error', e);
      return [];
    }
  }

  public async getCurrentBranch(projectPath: string) {
    const branches = await this.getBranches(projectPath);
    return branches.find(b => b.isCurrent)?.name || null;
  }

  public async checkoutBranch(projectPath: string, branchName: string) {
    if (!projectPath) return false;
    try {
      await execAsync(`git checkout ${branchName}`, { cwd: projectPath });
      return true;
    } catch (e) {
      console.error('Failed to checkout branch', e);
      return false;
    }
  }

  public async createBranch(projectPath: string, branchName: string) {
    if (!projectPath) return false;
    try {
      await execAsync(`git checkout -b ${branchName}`, { cwd: projectPath });
      return true;
    } catch (e) {
      console.error('Failed to create branch', e);
      return false;
    }
  }

  public async getStatus(projectPath: string) {
    if (!projectPath) return [];
    try {
      // Get all changes, untracked, etc.
      const { stdout } = await execAsync('git status -s', { cwd: projectPath });
      const files = stdout.trim().split('\n').filter(line => line.length > 0).map(line => {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        return { file, status: status.trim() };
      });
      return files;
    } catch (e) {
      console.error('Failed to get git status', e);
      return [];
    }
  }

  public async getDiff(projectPath: string, filePath?: string) {
    if (!projectPath) return '';
    try {
      // If filePath is provided, diff specific file, otherwise diff all
      // We do HEAD diff to include staged and unstaged changes, or just un-staged.
      // git diff + git diff --cached is complex, so we will use `git diff HEAD`
      const cmd = filePath ? `git diff HEAD -- "${filePath}"` : 'git diff HEAD';
      const { stdout } = await execAsync(cmd, { cwd: projectPath });
      return stdout;
    } catch (e) {
      console.error('Failed to get git diff', e);
      return '';
    }
  }
}
