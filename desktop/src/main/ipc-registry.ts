import { app, ipcMain, shell, BrowserWindow } from 'electron';
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
import { ToolExecutionBridge } from './tool-execution-bridge';
import { ApprovalEngine } from './approval-engine';
import { SkillManager } from './skill-manager';
import { getDataDir, getCliEntryPath } from './utils/env';

export class IpcRegistry {
  private desktopAuthTokens: { accessToken: string; refreshToken?: string } | null = null;

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
    ipcMain.handle('chat:create-session', async (_event, branch) => {
      const remoteSession = await this.createBackendSession();
      return this.chatManager.createSession(branch, {
        id: remoteSession.id,
        title: remoteSession.title,
      });
    });
    ipcMain.handle('chat:append-message', (_event, id, msg) => this.chatManager.appendMessage(id, msg));
    ipcMain.handle('chat:summarize-title', (_event, id, text) => this.chatManager.summarizeTitle(id, text));

    // Terminal PTY Handlers (single terminal for backward compat)
    let legacyTerminalId: string | null = null;
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
    });

    // Local Service Handlers
    ipcMain.handle('local-service:port', () => {
      return this.localServiceManager.isReady() ? this.localServiceManager.getPort() : null;
    });

    ipcMain.handle('local-service:is-ready', () => {
      return this.localServiceManager.isReady();
    });

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
    }) => {
      const { message, workspacePath, selectedFiles = [], sessionId } = payload;
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
        try {
          const port = this.localServiceManager.getPort();
          const [contextResp, filesResp] = await Promise.all([
            fetch(
            `http://127.0.0.1:${port}/context?path=${encodeURIComponent(workspacePath)}`,
            ),
            selectedFiles.length > 0
              ? fetch(`http://127.0.0.1:${port}/context/files`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ paths: selectedFiles }),
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
      }).catch(err => {
        console.error('[chat] stream failed', err);
      });

      return { ok: true, requestId, sessionId: resolvedSessionId, isNewSession };
    });

    // ================================================================
    // Thread Handlers (Phase 1 — multi-agent thread management)
    // ================================================================

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

    // ================================================================
    // Tool Approval Handlers (Phase 1 — agent tool execution bridge)
    // ================================================================

    ipcMain.handle('tool:approve', async (_event, payload: {
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      threadId: string;
    }) => {
      const { toolCallId, toolName, arguments: args, threadId } = payload;
      const result = await this.toolBridge.executeApproved(
        { toolCallId, toolName, arguments: args },
        threadId,
      );
      return result;
    });

    ipcMain.handle('tool:reject', async (_event, payload: {
      toolCallId: string;
    }) => {
      const port = this.getActivePort();
      const token = await this.ensureDesktopAccessToken();
      await fetch(`http://127.0.0.1:${port}/api/v1/agent/chat/tool_result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          toolCallId: payload.toolCallId,
          output: '[Tool execution rejected by user]',
          status: 'rejected',
        }),
      });
      return { ok: true };
    });

    // ================================================================
    // Approval Engine Handlers
    // ================================================================

    ipcMain.handle('approval:get-policy', () => {
      return this.approvalEngine.getPolicy();
    });

    ipcMain.handle('approval:set-mode', (_event, mode: import('./approval-engine').ApprovalMode) => {
      // The mode is read from the bridge's currentMode callback at execution time;
      // we store it in a shared location. For now, the mode is controlled via
      // the thread's active context. We expose it for the UI to update.
      return { ok: true };
    });

    // ================================================================
    // Terminal Pool Handlers (thread-aware terminal switching)
    // ================================================================

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

    // ================================================================
    // Review Panel Handlers (Phase 2 — diff review)
    // ================================================================

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

    // ================================================================
    // Skill Handlers (Phase 2 Track B — Skills system)
    // ================================================================

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
  }) {
    const { requestId, sessionId, message, systemContext, sender } = input;
    let assistantReply = '';

    try {
      const response = await this.backendRequestRaw('/api/v1/agent/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          message,
          systemContext,
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

        if (eventName === 'meta' || eventName === 'client_tool_call' || eventName === 'heartbeat') {
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

  private async backendRequestRaw(pathname: string, init: RequestInit): Promise<Response> {
    const token = await this.ensureDesktopAccessToken();
    const port = this.getActivePort();
    const headers = new Headers(init.headers || {});
    headers.set('Content-Type', 'application/json');
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
    const credentialsPath = path.join(getDataDir(), 'desktop-auth.json');
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
    if (fs.existsSync(credentialsPath)) {
      return JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) as {
        email: string;
        password: string;
      };
    }

    const credentials = {
      email: `desktop-${app.getVersion().replace(/[^0-9a-z]+/gi, '')}@example.com`,
      password: `Desktop!${randomBytes(12).toString('hex')}Aa1`,
    };
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
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
