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
}
