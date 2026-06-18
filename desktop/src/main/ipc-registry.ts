import { app, ipcMain, shell } from 'electron';
import { BackendManager } from './backend-manager';
import { CliManager } from './cli-manager';
import { PtyManager } from './pty-manager';
import { WorkspaceManager } from './workspace-manager';
import { GitManager } from './git-manager';
import { ChatManager } from './chat-manager';
import { LocalServiceManager } from './local-service-manager';
import { getDataDir, getCliEntryPath } from './utils/env';

export class IpcRegistry {
  constructor(
    private backendManager: BackendManager,
    private cliManager: CliManager,
    private ptyManager: PtyManager,
    private workspaceManager: WorkspaceManager,
    private gitManager: GitManager,
    private chatManager: ChatManager,
    private localServiceManager: LocalServiceManager,
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

    // Local Service Handlers
    ipcMain.handle('local-service:port', () => {
      return this.localServiceManager.isReady() ? this.localServiceManager.getPort() : null;
    });

    ipcMain.handle('local-service:is-ready', () => {
      return this.localServiceManager.isReady();
    });

    /**
     * chat:send-with-context
     * Aggregates workspace context from local-service then forwards to backend Gateway.
     * Body: { workspacePath?: string, selectedFiles?: string[], message: string, sessionId?: string }
     */
    ipcMain.handle('chat:send-with-context', async (_event, payload: {
      message: string;
      workspacePath?: string;
      selectedFiles?: string[];
      sessionId?: string;
    }) => {
      const { message, workspacePath, selectedFiles = [], sessionId } = payload;

      // Resolve session
      let resolvedSessionId = sessionId;
      if (!resolvedSessionId) {
        const active = this.workspaceManager.getActiveWorkspace();
        if (active) {
          resolvedSessionId = active;
        }
      }

      // Build systemContext by calling local-service
      let systemContext: string | undefined;
      if (this.localServiceManager.isReady() && workspacePath) {
        try {
          const port = this.localServiceManager.getPort();
          const resp = await fetch(
            `http://127.0.0.1:${port}/context?path=${encodeURIComponent(workspacePath)}`,
          );
          if (resp.ok) {
            const data = await resp.json() as { context: string };
            let ctx = data.context;

            // Append selected file contents
            if (selectedFiles.length > 0) {
              const fileContents: string[] = [];
              for (const filePath of selectedFiles.slice(0, 5)) { // max 5 files
                try {
                  const fResp = await fetch(
                    `http://127.0.0.1:${port}/file?path=${encodeURIComponent(filePath)}`,
                  );
                  if (fResp.ok) {
                    const fData = await fResp.json() as { name: string; content: string };
                    fileContents.push(`[File: ${fData.name}]\n${fData.content}`);
                  }
                } catch { /* skip unreadable file */ }
              }
              if (fileContents.length > 0) {
                ctx += '\n\nSelected files:\n' + fileContents.join('\n\n---\n\n');
              }
            }
            systemContext = ctx;
          }
        } catch (err) {
          console.warn('[ipc] Failed to fetch context from local-service:', err);
        }
      }

      // Forward to backend gateway
      const port = this.getActivePort();
      const resp = await fetch(`http://127.0.0.1:${port}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId: resolvedSessionId,
          systemContext,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Gateway error: ${resp.status}`);
      }

      return { ok: true, status: resp.status };
    });
  }
}
