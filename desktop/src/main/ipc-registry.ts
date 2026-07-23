import { app, ipcMain, shell, BrowserWindow, dialog, safeStorage, type OpenDialogOptions } from 'electron';
import { randomBytes, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BackendManager } from './backend-manager';
import { CliManager } from './cli-manager';
import { PtyPool } from './pty-pool';
import { WorkspaceManager } from './workspace-manager';
import { GitManager } from './git-manager';
import { ChatManager } from './chat-manager';
import { LocalServiceManager } from './local-service-manager';
import { ThreadManager } from './thread-manager';
import { ToolExecutionBridge, type BackendToolCall, type ToolExecutionEvent } from './tool-execution-bridge';
import { ApprovalEngine, type ApprovalMode } from './approval-engine';
import { SkillManager } from './skill-manager';
import { ComputerUseManager } from './computer-use-manager';
import { getDataDir, getCliEntryPath } from './utils/env';
import { isPathWithinRoot, normalizeTreeDepth, resolveAuthorizedRoot } from './workspace-access';

export class IpcRegistry {
  private desktopAuthTokens: { accessToken: string; refreshToken?: string } | null = null;
  private isLegacyEnabled: boolean;

  constructor(
    private backendManager: BackendManager,
    private cliManager: CliManager,
    private ptyPool: PtyPool,
    private workspaceManager: WorkspaceManager,
    private gitManager: GitManager,
    private chatManager: ChatManager,
    private localServiceManager: LocalServiceManager,
    private getActivePort: () => number,
    private threadManager: ThreadManager,
    private toolBridge: ToolExecutionBridge,
    private approvalEngine: ApprovalEngine,
    private mainWindowGetter: () => BrowserWindow | null,
    private skillManager: SkillManager,
    private computerUseManager: ComputerUseManager,
    private setApprovalMode: (mode: ApprovalMode) => void,
    private getApprovalMode: () => ApprovalMode,
  ) {
    // Keep this in lockstep with the bootstrap guard: raw developer IPC is
    // intentionally unavailable from a packaged release.
    this.isLegacyEnabled = !app.isPackaged && process.env.AI_AGENT_ENABLE_LEGACY_DEVTOOLS === '1';
  }

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
    
    if (this.isLegacyEnabled) {
      ipcMain.handle('cli:execute', (_event, args: string[]) => {
        const localServiceEnv = {
          LOCAL_SERVICE_URL: `http://127.0.0.1:${this.localServiceManager.getPort()}`,
          LOCAL_SERVICE_TOKEN: this.localServiceManager.getToken(),
        };
        return this.cliManager.execute(getCliEntryPath(), args, localServiceEnv);
      });
      
      ipcMain.on('cli:input', (_event, input: string) => {
        this.cliManager.sendInput(input);
      });
    }

    // Workspace Handlers
    if (this.isLegacyEnabled) {
    ipcMain.handle('workspace:get-all', () => this.workspaceManager.getWorkspaces());
    ipcMain.handle('workspace:get-active', () => this.workspaceManager.getActiveWorkspace());
    ipcMain.handle('workspace:set-active', (_event, path) => this.workspaceManager.setActiveWorkspace(path));
    ipcMain.handle('workspace:add', () => this.workspaceManager.addWorkspace());
    ipcMain.handle('workspace:get-file-tree', async (_event, path: string, depth?: number) => {
      if (!this.localServiceManager.isReady()) {
        return { tree: [] };
      }
      const workspaceRoot = this.resolveAuthorizedWorkspaceRoot(path);
      if (!workspaceRoot) {
        throw new Error('Workspace path is not authorized');
      }
      const safeDepth = normalizeTreeDepth(depth);
      try {
        const resp = await this.localServiceManager.fetch(
          `/workspace/tree?path=${encodeURIComponent(workspaceRoot)}&depth=${safeDepth}`,
        );
        if (resp.ok) {
          return await resp.json();
        }
        return { tree: [] };
      } catch {
        return { tree: [] };
      }
    });
    ipcMain.handle('workspace:check-local-service', () => ({
      ready: this.localServiceManager.isReady(),
    }));
    }

    // Git Handlers
    if (this.isLegacyEnabled) {
      ipcMain.handle('git:get-branches', (_event, path) => this.gitManager.getBranches(path));
      ipcMain.handle('git:get-current-branch', (_event, path) => this.gitManager.getCurrentBranch(path));
    ipcMain.handle('git:checkout', (_event, path, branch) => this.gitManager.checkoutBranch(path, branch));
    ipcMain.handle('git:create-branch', (_event, path, branch) => this.gitManager.createBranch(path, branch));
    ipcMain.handle('git:get-status', (_event, path) => this.gitManager.getStatus(path));
    ipcMain.handle('git:get-diff', (_event, path, file) => this.gitManager.getDiff(path, file));    }

    // Chat Handlers
    if (this.isLegacyEnabled) {
      ipcMain.handle('chat:get-sessions', () => this.chatManager.getSessionsSummary());
      ipcMain.handle('chat:get-session', (_event, id) => this.chatManager.getSession(id));
      ipcMain.handle('chat:create-session', async (_event, branch) => {
      const remoteSession = await this.createBackendSession();
      return this.chatManager.createSession(branch, {
        id: remoteSession.id,
        title: remoteSession.title,
      });
    });
    ipcMain.handle('chat:append-message', (_event, id, msg) => this.chatManager.appendMessage(id, msg));
    ipcMain.handle('chat:summarize-title', (_event, id, text) => this.chatManager.summarizeTitle(id, text));
    ipcMain.handle('chat:delete-session', (_event, id) => this.chatManager.deleteSession(id));    }

    // Terminal PTY Handlers (single terminal for backward compat)
    let legacyTerminalId: string | null = null;
    if (this.isLegacyEnabled) {
      ipcMain.handle('terminal:spawn', (event, cwd?: string) => {
      const thread = this.threadManager.getActiveThread();
      const threadId = thread?.id ?? '__legacy__';
      const terminalCwd = cwd || thread?.worktreePath || thread?.projectPath || process.cwd();
      const termId = this.ptyPool.spawn(threadId, terminalCwd, 'default');
      legacyTerminalId = termId;

      this.ptyPool.onData(termId, (data) => {
        event.sender.send('terminal:incomingData', data);
      });
      return { ok: true, terminalId: termId };
    });

    ipcMain.on('terminal:keystroke', (_event, data: string) => {
      if (legacyTerminalId) {
        this.ptyPool.write(legacyTerminalId, data);
      }
    });

    ipcMain.on('terminal:resize', (_event, cols: number, rows: number) => {
      if (legacyTerminalId) {
        this.ptyPool.resize(legacyTerminalId, cols, rows);
      }
    });    }

    // Local Service Handlers
    if (this.isLegacyEnabled) {
      ipcMain.handle('local-service:port', () => {
        return this.localServiceManager.isReady() ? this.localServiceManager.getPort() : null;
      });
      ipcMain.handle('local-service:is-ready', () => {
        return this.localServiceManager.isReady();
      });
    }

    ipcMain.handle('knowledge:request', async (event, payload: {
      method?: string;
      path: string;
      body?: unknown;
    }) => {
      // Validate sender window
      const win = this.mainWindowGetter();
      if (!win || event.sender !== win.webContents) {
        throw new Error('Unauthorized sender for knowledge:request');
      }

      if (!payload || typeof payload.path !== 'string') {
        throw new Error('Invalid request payload');
      }

      // Parse and normalize path
      const parsedUrl = new URL(payload.path, 'http://localhost');
      // normalize prevents directory traversal like /api/v1/../../../etc/passwd
      const normalizedPath = path.posix.normalize(parsedUrl.pathname);

      if (!normalizedPath.startsWith('/api/v1/')) {
        throw new Error('Knowledge API path must start with /api/v1/');
      }

      const method = (payload.method || 'GET').toUpperCase();
      
      // Whitelist filter
      if (!this.isKnowledgeApiAllowed(method, normalizedPath)) {
        throw new Error(`Knowledge API endpoint not allowed: ${method} ${normalizedPath}`);
      }

      const finalPath = normalizedPath + parsedUrl.search;

      return this.backendRequest(finalPath, {
        method,
        body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
      });
    });

    ipcMain.handle('knowledge:import-local-file', async (_event, payload?: {
      title?: string;
    }) => {
      const filePath = await this.selectKnowledgeFile();
      if (!filePath) {
        return { canceled: true };
      }

      const item = await this.importKnowledgeLocalFile(filePath, payload?.title);
      return { canceled: false, item };
    });

    // Computer Use Handlers
    if (this.isLegacyEnabled) {
      ipcMain.handle('computer:permissions', () => {
        return this.computerUseManager.permissions();
      });
    ipcMain.handle('computer:screenshot', () => {
      return this.computerUseManager.screenshot();
    });
    ipcMain.handle('computer:click', (_event, params) => {
      return this.computerUseManager.click(params ?? {});
    });
    ipcMain.handle('computer:type', (_event, params) => {
      return this.computerUseManager.typeText(params ?? {});
    });
    ipcMain.handle('computer:key', (_event, params) => {
      return this.computerUseManager.keypress(params ?? {});
    });
    ipcMain.handle('computer:scroll', (_event, params) => {
      return this.computerUseManager.scroll(params ?? {});
    });
      ipcMain.handle('computer:open-settings', (_event, pane?: string) => {
        return this.computerUseManager.openSettings(pane as 'accessibility' | 'screenRecording' | undefined);
      });
    }

    if (this.isLegacyEnabled) {
      ipcMain.handle('agent:submit-task', async (event, payload: { prompt: string }) => {
      const taskId = await this.submitAgentTask(payload.prompt);
      event.sender.send('agent:task-event', {
        taskId,
        type: 'START',
        sourceAgent: 'DESKTOP',
        content: payload.prompt,
      });
      void this.streamAgentTask(taskId, event.sender).catch(err => {
        console.error('[agent-task] stream failed', err);
        event.sender.send('agent:task-event', {
          taskId,
          type: 'ERROR',
          sourceAgent: 'DESKTOP',
          content: err instanceof Error ? err.message : String(err),
        });
      });
      return { ok: true, taskId };
    });

    ipcMain.handle('agent:approve-plan', async (_event, payload: { taskId: string; approved: boolean }) => {
      await this.approveAgentPlan(payload.taskId, payload.approved);
      return { ok: true };
    });

    /**
     * chat:send-with-context
     * Aggregates workspace context from local-service then forwards to backend Gateway.
     * Body: { workspacePath?: string, selectedFiles?: string[], message: string, sessionId?: string }
     */
    ipcMain.handle('chat:send-with-context', async (event, payload: {
      message: string;
      workspacePath?: string;
      selectedFiles?: string[];
      sessionId?: string;
      provider?: string;
      model?: string;
      customBaseUrl?: string;
      customApiKey?: string;
      customInstructions?: string;
    }) => {
      const { message, workspacePath, selectedFiles = [], sessionId, provider, model, customBaseUrl, customApiKey, customInstructions } = payload;
      const requestId = randomUUID();
      const isNewSession = !sessionId;
      const resolvedSessionId = sessionId ?? (await this.createBackendSession()).id;

      if (!this.chatManager.getSession(resolvedSessionId)) {
        this.chatManager.createSession('main', { id: resolvedSessionId });
      }
      const appendResult = this.chatManager.appendMessage(resolvedSessionId, {
        role: 'user',
        content: message,
        time: new Date().toLocaleTimeString(),
      });
      if (appendResult.session.messages.length === 1) {
        void this.chatManager.summarizeTitle(resolvedSessionId, message);
      }

      // Build systemContext by calling local-service
      let systemContext: string | undefined;
      if (this.localServiceManager.isReady() && workspacePath) {
        const workspaceRoot = this.resolveAuthorizedWorkspaceRoot(workspacePath);
        if (!workspaceRoot) {
          throw new Error('Workspace path is not authorized');
        }
        const authorizedFiles = selectedFiles.filter(filePath =>
          isPathWithinRoot(filePath, workspaceRoot));
        if (authorizedFiles.length !== selectedFiles.length) {
          throw new Error('Selected file is outside the authorized workspace');
        }
        try {
          const [contextResp, filesResp] = await Promise.all([
            this.localServiceManager.fetch(
              `/context?path=${encodeURIComponent(workspaceRoot)}`,
            ),
            authorizedFiles.length > 0
              ? this.localServiceManager.fetch('/context/files', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ paths: authorizedFiles }),
                })
              : Promise.resolve(null),
          ]);
          if (contextResp.ok) {
            const data = await contextResp.json() as { context: string };
            let ctx = data.context;

            if (filesResp?.ok) {
              const fileData = await filesResp.json() as {
                files?: Array<{ name: string; content: string }>;
              };
              const fileContents = (fileData.files ?? []).map(file => `[File: ${file.name}]\n${file.content}`);
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

      if (customInstructions && customInstructions.trim()) {
        systemContext = systemContext
          ? `${customInstructions.trim()}\n\n${systemContext}`
          : customInstructions.trim();
      }

      event.sender.send('chat:stream-event', {
        requestId,
        sessionId: resolvedSessionId,
        type: 'started',
      });

      void this.streamBackendChat({
        requestId,
        sessionId: resolvedSessionId,
        message,
        systemContext,
        sender: event.sender,
        provider,
        model,
        customBaseUrl,
        customApiKey,
      }).catch(err => {
        console.error('[chat] stream failed', err);
      });

      return { ok: true, requestId, sessionId: resolvedSessionId, isNewSession };
    });

    ipcMain.handle('chat:test-connection', async (_event, payload: {
      provider: string;
      customBaseUrl: string;
      customApiKey: string;
      model: string;
    }) => {
      const { customBaseUrl, customApiKey, model } = payload;
      const start = Date.now();
      try {
        const body = {
          model: model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (customApiKey && customApiKey.trim() !== '') {
          headers['Authorization'] = `Bearer ${customApiKey}`;
        }

        const response = await fetch(`${customBaseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return { ok: false, error: `HTTP ${response.status}: ${text || 'Unknown error'}` };
        }

        const delay = Date.now() - start;
        return { ok: true, delay };
      } catch (err: any) {
        return { ok: false, error: err.message || String(err) };
      }
    });
  }

    // ================================================================
    // Thread Handlers (Phase 1 — multi-agent thread management)
    // ================================================================

    if (this.isLegacyEnabled) {
      ipcMain.handle('thread:create', async (_event, opts: {
      name: string;
      projectPath: string;
      mode?: 'local' | 'worktree';
    }) => {
      const thread = await this.threadManager.createThread({
        name: opts.name,
        projectPath: opts.projectPath,
        mode: opts.mode,
      });
      return thread;
    });

    ipcMain.handle('thread:list', () => {
      return this.threadManager.listThreadSummaries();
    });

    ipcMain.handle('thread:get', (_event, id: string) => {
      return this.threadManager.getThread(id) ?? null;
    });

    ipcMain.handle('thread:switch', (_event, id: string) => {
      return this.threadManager.switchThread(id);
    });

    ipcMain.handle('thread:remove', async (_event, id: string) => {
      await this.threadManager.removeThread(id);
      return { ok: true };
    });

    ipcMain.handle('thread:rename', (_event, id: string, name: string) => {
      this.threadManager.renameThread(id, name);
      return { ok: true };
    });

    ipcMain.handle('thread:set-status', (_event, id: string, status: import('./thread-manager').ThreadStatus) => {
      this.threadManager.setThreadStatus(id, status);
      return { ok: true };
      });
    }

    // ================================================================
    // Tool Approval Handlers (Phase 1 — agent tool execution bridge)
    // ================================================================

    if (this.isLegacyEnabled) {
      ipcMain.handle('tool:approve', async (_event, payload: { toolCallId: string }) => {
        return this.toolBridge.executeApproved(payload.toolCallId);
      });

    ipcMain.handle('tool:reject', async (_event, payload: {
      toolCallId: string;
    }) => {
      return this.toolBridge.rejectPending(payload.toolCallId);
      });
    }

    // ================================================================
    // Approval Engine Handlers
    // ================================================================

    if (this.isLegacyEnabled) {
      ipcMain.handle('approval:get-policy', () => {
        return this.approvalEngine.getPolicy();
      });

    ipcMain.handle('approval:get-mode', () => {
      return this.getApprovalMode();
    });

    ipcMain.handle('approval:set-mode', (_event, mode: ApprovalMode) => {
      if (!['suggest', 'auto-edit', 'full-auto'].includes(mode)) {
        return { ok: false, error: `Unsupported approval mode: ${mode}` };
      }
      this.setApprovalMode(mode);
      return { ok: true };
      });
    }

    // ================================================================
    // Terminal Pool Handlers (thread-aware terminal switching)
    // ================================================================

    if (this.isLegacyEnabled) {
      ipcMain.handle('terminal:spawn-for-thread', (event, payload: {
      threadId: string;
      cwd: string;
    }) => {
      const termId = this.ptyPool.spawn(payload.threadId, payload.cwd, payload.threadId);
      this.ptyPool.onData(termId, (data) => {
        event.sender.send('terminal:incomingData', data);
      });
      return { terminalId: termId };
    });

    ipcMain.handle('terminal:list', () => {
      return this.ptyPool.list().map(t => ({ id: t.id, threadId: t.threadId, cwd: t.cwd, label: t.label }));
    });

    ipcMain.handle('terminal:write', (_event, payload: {
      terminalId: string;
      data: string;
    }) => {
      this.ptyPool.write(payload.terminalId, payload.data);
      return { ok: true };
      });
    }

    // ================================================================
    // Review Panel Handlers (Phase 2 — diff review)
    // ================================================================

    if (this.isLegacyEnabled) {
      ipcMain.handle('review:get-diff', async (_event, projectPath: string) => {
        return this.gitManager.getStructuredDiff(projectPath);
      });

    ipcMain.handle('review:stage-file', async (_event, projectPath: string, file: string) => {
      return this.gitManager.stageFile(projectPath, file);
    });

    ipcMain.handle('review:revert-file', async (_event, projectPath: string, file: string) => {
      return this.gitManager.revertFile(projectPath, file);
    });

    ipcMain.handle('review:stage-hunk', async (_event, projectPath: string, file: string, hunkIndex: number) => {
      return this.gitManager.stageHunk(projectPath, file, hunkIndex);
    });

    ipcMain.handle('review:revert-hunk', async (_event, projectPath: string, file: string, hunkIndex: number) => {
      return this.gitManager.revertHunk(projectPath, file, hunkIndex);
    });

    ipcMain.handle('review:commit', async (_event, projectPath: string, message: string) => {
      return this.gitManager.commit(projectPath, message);
    });

    ipcMain.handle('review:push', async (_event, projectPath: string) => {
      return this.gitManager.push(projectPath);
    });

    ipcMain.handle('review:create-pr', async (_event, projectPath: string, options: { title: string; body?: string; base?: string }) => {
      return this.gitManager.createPullRequest(projectPath, options);
      });
    }

    // ================================================================
    // Skill Handlers (Phase 2 Track B — Skills system)
    // ================================================================

    if (this.isLegacyEnabled) {
      ipcMain.handle('skill:discover', () => {
        this.skillManager.discoverSkills();
        return { ok: true };
      });

    ipcMain.handle('skill:list', () => {
      return this.skillManager.listSkills();
    });

    ipcMain.handle('skill:get', (_event, name: string) => {
      const skill = this.skillManager.getSkill(name);
      if (!skill) return null;
      // Return without the full instructions body (send via skill:read)
      const { instructions: _i, ...rest } = skill;
      return rest;
    });

    ipcMain.handle('skill:read', (_event, name: string) => {
      return this.skillManager.readSkill(name) ?? null;
    });

    ipcMain.handle('skill:install', (_event, sourcePath: string, targetName?: string) => {
      const skill = this.skillManager.installSkill(sourcePath, targetName);
      return skill ?? null;
    });

    ipcMain.handle('skill:refresh', () => {
      this.skillManager.refresh();
      return { ok: true };
    });

      ipcMain.handle('skill:set-project-paths', (_event, projectPath?: string, workspacePath?: string) => {
        this.skillManager.setProjectScanPaths(projectPath, workspacePath);
        return { ok: true };
      });
    }
  }

  private async createBackendSession(): Promise<{ id: string; title: string }> {
    const response = await this.backendRequest('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: '新对话', provider: 'OPENAI' }),
    });
    return {
      id: String(response.id),
      title: typeof response.title === 'string' && response.title.trim() ? response.title : '新对话',
    };
  }

  private async submitAgentTask(prompt: string): Promise<string> {
    const response = await fetch(`${this.getAgentGatewayBaseUrl()}/api/v1/agent/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) {
      throw new Error(await this.toErrorMessage(response));
    }
    return (await response.text()).trim();
  }

  private async approveAgentPlan(taskId: string, approved: boolean): Promise<void> {
    const response = await fetch(`${this.getAgentGatewayBaseUrl()}/api/v1/agent/task/${taskId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    });
    if (!response.ok) {
      throw new Error(await this.toErrorMessage(response));
    }
  }

  private async streamAgentTask(taskId: string, sender: Electron.WebContents): Promise<void> {
    const response = await fetch(`${this.getAgentGatewayBaseUrl()}/api/v1/agent/stream/${taskId}`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(await this.toErrorMessage(response));
    }
    if (!response.body) {
      throw new Error('Task stream body is empty');
    }

    await this.parseSseStream(response.body, (_eventName, data) => {
      const parsed = this.tryParseJson(data);
      if (!parsed) {
        return;
      }
      sender.send('agent:task-event', parsed);
    });
  }

  private async streamBackendChat(input: {
    requestId: string;
    sessionId: string;
    message: string;
    systemContext?: string;
    sender: Electron.WebContents;
    provider?: string;
    model?: string;
    customBaseUrl?: string;
    customApiKey?: string;
  }) {
    const { requestId, sessionId, message, systemContext, sender, provider, model, customBaseUrl, customApiKey } = input;
    let assistantReply = '';

    try {
      const response = await this.backendRequestRaw('/api/v1/agent/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          message,
          systemContext,
          provider,
          model,
          customBaseUrl,
          customApiKey,
        }),
      });

      if (!response.body) {
        throw new Error('Streaming response body is empty');
      }

      await this.parseSseStream(response.body, (eventName, data) => {
        if (eventName === 'chunk') {
          assistantReply += data;
          sender.send('chat:stream-event', { requestId, sessionId, type: 'chunk', chunk: data });
          return;
        }

        if (eventName === 'client_tool_call') {
          sender.send('chat:stream-event', { requestId, sessionId, type: eventName, data });
          void this.handleClientToolCall(data, requestId, sessionId, sender);
          return;
        }

        if (eventName === 'meta' || eventName === 'heartbeat') {
          sender.send('chat:stream-event', { requestId, sessionId, type: eventName, data });
          return;
        }

        if (eventName === 'done') {
          const parsed = this.tryParseJson(data);
          const reply =
            parsed && typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
              ? parsed.reply
              : assistantReply;
          assistantReply = reply;
          sender.send('chat:stream-event', { requestId, sessionId, type: 'done', data: parsed, reply });
          return;
        }

        if (eventName === 'error') {
          const parsed = this.tryParseJson(data);
          const messageText =
            parsed && typeof parsed.message === 'string' ? parsed.message : data || 'Stream failed';
          sender.send('chat:stream-event', { requestId, sessionId, type: 'error', message: messageText });
        }
      });

      if (assistantReply.trim()) {
        this.chatManager.appendMessage(sessionId, {
          role: 'agent',
          content: assistantReply,
          time: new Date().toLocaleTimeString(),
        });
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      sender.send('chat:stream-event', { requestId, sessionId, type: 'error', message: messageText });
      throw error;
    }
  }

  private async backendRequest(pathname: string, init: RequestInit): Promise<any> {
    const response = await this.backendRequestRaw(pathname, init);
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  }

  private async selectKnowledgeFile(): Promise<string | null> {
    const options: OpenDialogOptions = {
      title: '选择 Markdown 或 PDF 资料',
      buttonLabel: '导入到 Inbox',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown / PDF', extensions: ['md', 'markdown', 'pdf'] },
        { name: 'Markdown', extensions: ['md', 'markdown', 'txt', 'html', 'htm'] },
        { name: 'PDF', extensions: ['pdf'] },
      ],
    };
    const window = this.mainWindowGetter();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    if (!this.isSupportedKnowledgeFile(filePath)) {
      throw new Error('仅支持 Markdown 与 PDF 文件。');
    }
    return filePath;
  }

  private async importKnowledgeLocalFile(filePath: string, title?: string): Promise<any> {
    const filename = path.basename(filePath);
    const fileBuffer = await fs.promises.readFile(filePath);
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: this.mimeTypeForKnowledgeFile(filePath) }), filename);

    const normalizedTitle = title?.trim();
    if (normalizedTitle) {
      formData.append('title', normalizedTitle);
    }

    return this.backendRequest('/api/v1/knowledge-items/import/upload', {
      method: 'POST',
      body: formData,
    });
  }

  private isSupportedKnowledgeFile(filePath: string): boolean {
    return ['.md', '.markdown', '.pdf', '.txt', '.html', '.htm'].includes(path.extname(filePath).toLowerCase());
  }

  private mimeTypeForKnowledgeFile(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.pdf') return 'application/pdf';
    if (extension === '.md' || extension === '.markdown') return 'text/markdown';
    if (extension === '.html' || extension === '.htm') return 'text/html';
    return 'text/plain';
  }

  private async backendRequestRaw(pathname: string, init: RequestInit): Promise<Response> {
    const token = await this.ensureDesktopAccessToken();
    const port = this.getActivePort();
    const headers = new Headers(init.headers || {});
    if (!headers.has('Content-Type') && !this.isMultipartBody(init.body)) {
      headers.set('Content-Type', 'application/json');
    }
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
    if (response.status === 401) {
      this.desktopAuthTokens = null;
      const retryToken = await this.ensureDesktopAccessToken();
      headers.set('Authorization', `Bearer ${retryToken}`);
      const retry = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
      if (!retry.ok) {
        throw new Error(await this.toErrorMessage(retry));
      }
      return retry;
    }

    if (!response.ok) {
      throw new Error(await this.toErrorMessage(response));
    }
    return response;
  }

  private isMultipartBody(body: RequestInit['body'] | undefined): body is FormData {
    return typeof FormData !== 'undefined' && body instanceof FormData;
  }

  public async getDesktopAccessToken(): Promise<string> {
    return this.ensureDesktopAccessToken();
  }

  private isKnowledgeApiAllowed(method: string, pathname: string): boolean {
    const allowedPrefixes = [
      '/api/v1/dashboard',
      '/api/v1/knowledge-items',
      '/api/v1/tags',
      '/api/v1/model-sources',
      '/api/v1/settings',
      '/api/v1/sessions'
    ];
    
    // Ensure path starts with one of the allowed prefixes
    if (!allowedPrefixes.some(prefix => pathname.startsWith(prefix))) {
      return false;
    }

    // Only allow expected HTTP methods
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      return false;
    }

    return true;
  }

  private async ensureDesktopAccessToken(): Promise<string> {
    if (this.desktopAuthTokens?.accessToken) {
      return this.desktopAuthTokens.accessToken;
    }

    const credentials = this.loadDesktopCredentials();
    const login = async () => {
      const port = this.getActivePort();
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        throw new Error(await this.toErrorMessage(response));
      }
      const tokens = await response.json() as { accessToken: string; refreshToken?: string };
      this.desktopAuthTokens = tokens;
      return tokens.accessToken;
    };

    try {
      return await login();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Invalid credentials')
        && !message.includes('Invalid email or password')
        && !message.includes('Request failed (401)')) {
        throw error;
      }

      const port = this.getActivePort();
      const registerResponse = await fetch(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!registerResponse.ok) {
        const registerMessage = await this.toErrorMessage(registerResponse);
        if (!registerMessage.includes('already')) {
          throw new Error(registerMessage);
        }
      }
      return login();
    }
  }

  private loadDesktopCredentials(): { email: string; password: string } {
    const isProd = app.isPackaged;
    if (isProd && !safeStorage.isEncryptionAvailable()) {
      throw new Error('SafeStorage is not available in production environment');
    }

    const legacyPath = path.join(getDataDir(), 'desktop-auth.json');
    const credentialsPath = path.join(getDataDir(), 'desktop-auth-enc.txt');
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });

    // Migrate from legacy unencrypted json
    if (fs.existsSync(legacyPath)) {
      try {
        const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        if (legacyData.email && legacyData.password) {
          const encData = safeStorage.isEncryptionAvailable()
            ? safeStorage.encryptString(JSON.stringify(legacyData))
            : Buffer.from(JSON.stringify(legacyData));
          fs.writeFileSync(credentialsPath, encData);
        }
        fs.unlinkSync(legacyPath);
      } catch (e) {
        console.warn('Failed to migrate legacy credentials', e);
      }
    }

    if (fs.existsSync(credentialsPath)) {
      try {
        const fileData = fs.readFileSync(credentialsPath);
        const decData = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(fileData)
          : fileData.toString('utf8');
        return JSON.parse(decData) as { email: string; password: string };
      } catch (e) {
        console.warn('Failed to read encrypted credentials', e);
      }
    }

    const credentials = {
      email: `desktop-${app.getVersion().replace(/[^0-9a-z]+/gi, '')}@example.com`,
      password: `Desktop!${randomBytes(12).toString('hex')}Aa1`,
    };

    try {
      const encData = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(JSON.stringify(credentials))
        : Buffer.from(JSON.stringify(credentials));
      fs.writeFileSync(credentialsPath, encData);
    } catch (e) {
      console.warn('Failed to write encrypted credentials', e);
    }
    
    return credentials;
  }

  private async parseSseStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (eventName: string, data: string) => void,
  ) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');

      let delimiter = buffer.indexOf('\n\n');
      while (delimiter >= 0) {
        const block = buffer.slice(0, delimiter).trim();
        buffer = buffer.slice(delimiter + 2);
        if (block) {
          const eventName = block
            .split('\n')
            .find(line => line.startsWith('event:'))
            ?.slice(6)
            .trim() || 'message';
          const data = block
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart())
            .join('');
          onEvent(eventName, data);
        }
        delimiter = buffer.indexOf('\n\n');
      }

      if (done) {
        return;
      }
    }
  }

  private getAgentGatewayBaseUrl(): string {
    const configured = process.env.AGENT_GATEWAY_BASE_URL || process.env.AGENT_API_BASE_URL;
    if (configured && configured.trim()) {
      return configured.replace(/\/$/, '');
    }
    return `http://127.0.0.1:${this.getActivePort()}`;
  }

  private tryParseJson(input: string): any | null {
    if (!input) return null;
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  private async handleClientToolCall(
    data: string,
    requestId: string,
    sessionId: string,
    sender: Electron.WebContents,
  ): Promise<void> {
    const toolCall = this.toBackendToolCall(data);
    if (!toolCall) {
      sender.send('chat:stream-event', {
        requestId,
        sessionId,
        type: 'tool:error',
        message: 'Unable to parse client tool call',
      });
      return;
    }

    const thread = this.threadManager.getActiveThread();
    const threadId = thread?.id ?? '__legacy__';
    this.ensureToolTerminal(threadId);

    await this.toolBridge.execute(toolCall, threadId, (event) => {
      this.forwardToolEvent(event, requestId, sessionId, sender);
    });
  }

  private ensureToolTerminal(threadId: string): void {
    if (this.ptyPool.findByThreadId(threadId)) {
      return;
    }
    const thread = this.threadManager.getActiveThread();
    const activeWorkspace = this.workspaceManager.getActiveWorkspace();
    const cwd = thread?.worktreePath || thread?.projectPath || activeWorkspace || process.cwd();
    this.ptyPool.spawn(threadId, cwd, thread?.name || 'tool');
  }

  private forwardToolEvent(
    event: ToolExecutionEvent,
    requestId: string,
    sessionId: string,
    sender: Electron.WebContents,
  ): void {
    sender.send('chat:stream-event', {
      requestId,
      sessionId,
      type: event.type,
      data: event,
      message: event.message,
    });
  }

  private toBackendToolCall(data: string): BackendToolCall | null {
    const parsed = this.tryParseJson(data);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const toolCallId = String(parsed.toolCallId ?? parsed.id ?? '');
    const toolName = String(parsed.toolName ?? parsed.name ?? '');
    if (!toolCallId || !toolName) {
      return null;
    }

    let args: Record<string, unknown> = {};
    if (parsed.arguments && typeof parsed.arguments === 'object') {
      args = parsed.arguments as Record<string, unknown>;
    } else if (typeof parsed.argumentsJson === 'string' && parsed.argumentsJson.trim()) {
      const parsedArgs = this.tryParseJson(parsed.argumentsJson);
      if (parsedArgs && typeof parsedArgs === 'object') {
        args = parsedArgs as Record<string, unknown>;
      }
    }

    return { toolCallId, toolName, arguments: args };
  }

  private resolveAuthorizedWorkspaceRoot(requestedPath: string): string | null {
    const thread = this.threadManager.getActiveThread();
    const roots = [
      ...this.workspaceManager.getWorkspaces().map(workspace => workspace.path),
      thread?.projectPath,
      thread?.worktreePath,
    ].filter((root): root is string => Boolean(root));
    return resolveAuthorizedRoot(requestedPath, roots);
  }

  private async toErrorMessage(response: Response): Promise<string> {
    const text = await response.text();
    if (!text) {
      return `Request failed (${response.status})`;
    }
    try {
      const parsed = JSON.parse(text) as { message?: string; code?: string };
      return parsed.message || parsed.code || `Request failed (${response.status})`;
    } catch {
      return text;
    }
  }
}
