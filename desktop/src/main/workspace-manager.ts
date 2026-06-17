import { dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getDataDir } from './utils/env';

export class WorkspaceManager {
  private configPath: string;
  private workspaces: string[] = [];
  private activeWorkspace: string | null = null;

  constructor() {
    this.configPath = path.join(getDataDir(), 'workspaces.json');
    this.loadConfig();
  }

  private loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(data);
        this.workspaces = parsed.workspaces || [];
        this.activeWorkspace = parsed.activeWorkspace || null;
      }
    } catch (e) {
      console.error('Failed to load workspaces config', e);
    }
  }

  private saveConfig() {
    try {
      if (!fs.existsSync(getDataDir())) {
        fs.mkdirSync(getDataDir(), { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify({
        workspaces: this.workspaces,
        activeWorkspace: this.activeWorkspace
      }, null, 2));
    } catch (e) {
      console.error('Failed to save workspaces config', e);
    }
  }

  public getWorkspaces() {
    return this.workspaces.map(p => ({
      path: p,
      name: path.basename(p)
    }));
  }

  public getActiveWorkspace() {
    return this.activeWorkspace;
  }

  public setActiveWorkspace(workspacePath: string) {
    if (this.workspaces.includes(workspacePath)) {
      this.activeWorkspace = workspacePath;
      this.saveConfig();
      return true;
    }
    return false;
  }

  public async addWorkspace() {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      if (!this.workspaces.includes(selectedPath)) {
        this.workspaces.push(selectedPath);
      }
      this.activeWorkspace = selectedPath;
      this.saveConfig();
      return { path: selectedPath, name: path.basename(selectedPath) };
    }
    return null;
  }
}
