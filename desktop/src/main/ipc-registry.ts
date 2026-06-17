import { app, ipcMain, shell } from 'electron';
import { BackendManager } from './backend-manager';
import { CliManager } from './cli-manager';
import { PtyManager } from './pty-manager';
import { WorkspaceManager } from './workspace-manager';
import { GitManager } from './git-manager';
import { ChatManager } from './chat-manager';
import { getDataDir, getCliEntryPath } from './utils/env';

export class IpcRegistry {
  constructor(
    private backendManager: BackendManager,
    private cliManager: CliManager,
    private ptyManager: PtyManager,
    private workspaceManager: WorkspaceManager,
    private gitManager: GitManager,
    private chatManager: ChatManager,
    private getActivePort: () => number
  ) {}

  public setupIpc() {
    ipcMain.handle('backend:status', () => this.backendManager.getStatus());
    ipcMain.handle('backend:restart', () => this.backendManager.restart());
    ipcMain.handle('backend:open-log-file', () => shell.showItemInFolder(this.backendManager.getStatus().logPath));
    
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.handle('app:data-dir', () => getDataDir());
    ipcMain.handle('app:open-data-dir', () => {
      shell.openPath(getDataDir());
    });
    
    ipcMain.handle('backend:port', () => this.getActivePort());
    
    ipcMain.handle('cli:execute', (_event, args: string[]) => {
      return this.cliManager.execute(getCliEntryPath(), args);
    });
    
    ipcMain.on('cli:input', (_event, input: string) => {
      this.cliManager.sendInput(input);
    });

    // Workspace Handlers
    ipcMain.handle('workspace:get-all', () => this.workspaceManager.getWorkspaces());
    ipcMain.handle('workspace:get-active', () => this.workspaceManager.getActiveWorkspace());
    ipcMain.handle('workspace:set-active', (_event, path) => this.workspaceManager.setActiveWorkspace(path));
    ipcMain.handle('workspace:add', () => this.workspaceManager.addWorkspace());

    // Git Handlers
    ipcMain.handle('git:get-branches', (_event, path) => this.gitManager.getBranches(path));
    ipcMain.handle('git:get-current-branch', (_event, path) => this.gitManager.getCurrentBranch(path));
    ipcMain.handle('git:checkout', (_event, path, branch) => this.gitManager.checkoutBranch(path, branch));
    ipcMain.handle('git:create-branch', (_event, path, branch) => this.gitManager.createBranch(path, branch));
    ipcMain.handle('git:get-status', (_event, path) => this.gitManager.getStatus(path));
    ipcMain.handle('git:get-diff', (_event, path, file) => this.gitManager.getDiff(path, file));

    // Chat Handlers
    ipcMain.handle('chat:get-sessions', () => this.chatManager.getSessionsSummary());
    ipcMain.handle('chat:get-session', (_event, id) => this.chatManager.getSession(id));
    ipcMain.handle('chat:create-session', (_event, branch) => this.chatManager.createSession(branch));
    ipcMain.handle('chat:append-message', (_event, id, msg) => this.chatManager.appendMessage(id, msg));
    ipcMain.handle('chat:summarize-title', (_event, id, text) => this.chatManager.summarizeTitle(id, text));

    // Terminal PTY Handlers
    ipcMain.handle('terminal:spawn', (event) => {
      this.ptyManager.spawn();
      this.ptyManager.onData((data) => {
        event.sender.send('terminal:incomingData', data);
      });
    });

    ipcMain.on('terminal:keystroke', (_event, data: string) => {
      this.ptyManager.write(data);
    });

    ipcMain.on('terminal:resize', (_event, cols: number, rows: number) => {
      this.ptyManager.resize(cols, rows);
    });
  }
}
