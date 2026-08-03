import { app, ipcMain, shell, BrowserWindow, dialog, safeStorage, type OpenDialogOptions, type WebContents } from 'electron';
import { createHash, randomBytes, randomUUID } from 'crypto';
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
import {
  KnowledgeSourceManager,
  type ManagedSourceReadResult,
  type ManagedSourceUploadRequest,
  type ManagedSourceUploadResult,
} from './knowledge-source-manager';
import { getDataDir, getCliEntryPath } from './utils/env';
import { isPathWithinRoot, normalizeTreeDepth, resolveAuthorizedRoot } from './workspace-access';

const MAX_KNOWLEDGE_BACKUP_BYTES = 100 * 1024 * 1024;
const MAX_KNOWLEDGE_IMPORT_BATCH_FILES = 20;
const MAX_KNOWLEDGE_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
const KNOWLEDGE_IMPORT_BATCH_TTL_MS = 10 * 60 * 1000;

type KnowledgeImportCandidateVerdict = 'ready' | 'duplicate_existing' | 'duplicate_in_batch' | 'invalid';

type LocalKnowledgeImportCandidate = {
  candidateId: string;
  filePath: string;
  name: string;
  size: number;
  modifiedAtMs: number;
  contentHash: string | null;
  verdict: KnowledgeImportCandidateVerdict;
  reason?: string;
};

type LocalKnowledgeImportBatch = {
  senderId: number;
  expiresAt: number;
  candidates: LocalKnowledgeImportCandidate[];
};

type LocalKnowledgeImportFileContent = {
  content: Buffer;
  size: number;
  modifiedAtMs: number;
};

type PublicKnowledgeImportCandidate = Pick<
  LocalKnowledgeImportCandidate,
  'candidateId' | 'name' | 'size' | 'verdict' | 'reason'
>;

type LocalKnowledgeImportPreflightResponse = {
  canceled: boolean;
  batchId?: string;
  candidates: PublicKnowledgeImportCandidate[];
};

type LocalKnowledgeImportCommitResponse = {
  imported: Array<{ candidateId: string; name: string }>;
  skipped: Array<{ candidateId: string; name: string; reason: string }>;
  failed: Array<{ candidateId: string; name: string; reason: string }>;
};

export function redactIngestionJobSnapshots(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactIngestionJobSnapshots);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'inputSnapshot' && key !== 'resultSnapshot')
      .map(([key, nestedValue]) => [key, redactIngestionJobSnapshots(nestedValue)]),
  );
}

export function toSafeLocalKnowledgeImportReason(error: unknown): string {
  const message = (
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : String(error || '')
  );
  if (!message) {
    return '文件导入失败，请重新预检后重试。';
  }
  // Node filesystem errors include absolute paths. Never pass those through the IPC boundary.
  if (/(?:[A-Za-z]:)?[\\/]/.test(message)) {
    return '文件导入失败，请重新预检后重试。';
  }
  return message;
}

export class IpcRegistry {
  private desktopAuthTokens: { accessToken: string; refreshToken?: string } | null = null;
  private isLegacyEnabled: boolean;
  private readonly localKnowledgeImportBatches = new Map<string, LocalKnowledgeImportBatch>();

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
    private knowledgeSourceManager: KnowledgeSourceManager,
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
    ipcMain.handle('workspace:set-active', async (_event, path) => {
      const changed = this.workspaceManager.setActiveWorkspace(path);
      if (changed) await this.localServiceManager.start(path);
      return changed;
    });
    ipcMain.handle('workspace:add', async () => {
      const workspace = await this.workspaceManager.addWorkspace();
      if (workspace) await this.localServiceManager.start(workspace.path);
      return workspace;
    });
    ipcMain.handle('workspace:get-file-tree', async (_event, path: string, depth?: number) => {
      const workspaceRoot = this.resolveAuthorizedWorkspaceRoot(path);
      if (!workspaceRoot) {
        throw new Error('Workspace path is not authorized');
      }
      const safeDepth = normalizeTreeDepth(depth);
      try {
         const resp = await this.localServiceManager.fetchForWorkspace(workspaceRoot,
          `/workspace/tree?path=.&depth=${safeDepth}`,
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
      const response = await this.backendRequest(finalPath, {
        method,
        body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
      });
      if (method === 'GET' && normalizedPath === '/api/v1/ingestion-jobs') {
        return redactIngestionJobSnapshots(response);
      }
      return response;
    });

    ipcMain.handle('knowledge:import-local-file', async (event, payload?: {
      title?: string;
    }) => {
      this.assertKnowledgeSender(event.sender);
      const filePath = await this.selectKnowledgeFile();
      if (!filePath) {
        return { canceled: true };
      }

      const result = await this.importKnowledgeLocalFile(filePath, payload?.title);
      return { canceled: false, item: result.item, skipped: result.outcome === 'skipped' };
    });

    ipcMain.handle('knowledge:preflight-local-file-batch', async (event): Promise<LocalKnowledgeImportPreflightResponse> => {
      this.assertKnowledgeSender(event.sender);
      return this.preflightLocalKnowledgeImportBatch(event.sender.id);
    });

    ipcMain.handle(
      'knowledge:commit-local-file-batch',
      async (event, payload?: { batchId?: string; candidateIds?: string[] }): Promise<LocalKnowledgeImportCommitResponse> => {
        this.assertKnowledgeSender(event.sender);
        return this.commitLocalKnowledgeImportBatch(event.sender.id, payload);
      },
    );

    // Managed source folders intentionally have a narrow IPC surface. The
    // manager owns all directory paths, cursors, and stored asset locations;
    // renderer callers receive only opaque IDs and safe DTOs.
    ipcMain.handle('knowledge:list-managed-source-folders', (event) => {
      this.assertKnowledgeSender(event.sender);
      return this.knowledgeSourceManager.listManagedSourceFolders();
    });

    ipcMain.handle('knowledge:add-managed-source-folder', async (event) => {
      this.assertKnowledgeSender(event.sender);
      return this.knowledgeSourceManager.addManagedSourceFolder(() => this.selectManagedSourceFolder());
    });

    ipcMain.handle('knowledge:set-managed-source-folder-enabled', async (event, payload?: {
      folderId?: unknown;
      enabled?: unknown;
    }) => {
      this.assertKnowledgeSender(event.sender);
      return this.knowledgeSourceManager.setManagedSourceFolderEnabled(payload?.folderId, payload?.enabled);
    });

    ipcMain.handle('knowledge:scan-managed-source-folder', async (event, payload?: { folderId?: unknown }) => {
      this.assertKnowledgeSender(event.sender);
      return this.knowledgeSourceManager.scanManagedSourceFolder(payload?.folderId);
    });

    ipcMain.handle('knowledge:remove-managed-source-folder', async (event, payload?: { folderId?: unknown }) => {
      this.assertKnowledgeSender(event.sender);
      return this.knowledgeSourceManager.removeManagedSourceFolder(payload?.folderId);
    });

    ipcMain.handle('knowledge:open-managed-source-asset', async (event, payload?: {
      assetId?: unknown;
      reveal?: unknown;
    }) => {
      this.assertKnowledgeSender(event.sender);
      return this.knowledgeSourceManager.openManagedSourceAsset(payload?.assetId, payload?.reveal === true);
    });

    ipcMain.handle('knowledge:save-backup', async (event, payload?: {
      content?: string;
      suggestedName?: string;
    }) => {
      const win = this.mainWindowGetter();
      if (!win || event.sender !== win.webContents) {
        throw new Error('Unauthorized sender for knowledge:save-backup');
      }
      return this.saveKnowledgeBackup(payload?.content, payload?.suggestedName, win);
    });

    ipcMain.handle('knowledge:select-backup', async (event) => {
      const win = this.mainWindowGetter();
      if (!win || event.sender !== win.webContents) {
        throw new Error('Unauthorized sender for knowledge:select-backup');
      }
      return this.selectKnowledgeBackup(win);
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
       if (workspacePath) {
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
             this.localServiceManager.fetchForWorkspace(workspaceRoot, '/context'),
            authorizedFiles.length > 0
               ? this.localServiceManager.fetchForWorkspace(workspaceRoot, '/context/files', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ paths: authorizedFiles.map(filePath => path.relative(workspaceRoot, filePath) || '.') }),
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

  private assertKnowledgeSender(sender: WebContents): void {
    const window = this.mainWindowGetter();
    if (!window || sender !== window.webContents) {
      throw new Error('Unauthorized sender for Knowledge Desk file import');
    }
  }

  private async preflightLocalKnowledgeImportBatch(senderId: number): Promise<LocalKnowledgeImportPreflightResponse> {
    this.removeExpiredKnowledgeImportBatches();
    const filePaths = await this.selectKnowledgeFiles();
    if (!filePaths) {
      return { canceled: true, candidates: [] };
    }
    if (filePaths.length > MAX_KNOWLEDGE_IMPORT_BATCH_FILES) {
      throw new Error(`一次最多选择 ${MAX_KNOWLEDGE_IMPORT_BATCH_FILES} 个文件。`);
    }

    const candidates: LocalKnowledgeImportCandidate[] = [];
    const firstCandidateIdByHash = new Map<string, string>();
    for (const filePath of filePaths) {
      const candidate = await this.inspectLocalKnowledgeImportFile(filePath);
      if (candidate.verdict === 'ready' && candidate.contentHash) {
        const firstCandidateId = firstCandidateIdByHash.get(candidate.contentHash);
        if (firstCandidateId) {
          candidate.verdict = 'duplicate_in_batch';
          candidate.reason = '与本次选择的另一份文件内容完全相同，已跳过。';
        } else {
          firstCandidateIdByHash.set(candidate.contentHash, candidate.candidateId);
        }
      }
      candidates.push(candidate);
    }

    const hashes = candidates
      .filter((candidate) => candidate.verdict === 'ready' && candidate.contentHash)
      .map((candidate) => candidate.contentHash as string);
    if (hashes.length > 0) {
      const preflight = await this.backendRequest('/api/v1/knowledge-items/import/preflight', {
        method: 'POST',
        body: JSON.stringify({ contentHashes: hashes }),
      });
      const existingContentHashes = this.readExistingContentHashes(preflight);
      candidates.forEach((candidate) => {
        if (candidate.verdict === 'ready' && candidate.contentHash && existingContentHashes.has(candidate.contentHash)) {
          candidate.verdict = 'duplicate_existing';
          candidate.reason = '此文件内容已在本机知识库中，已跳过。';
        }
      });
    }

    const batchId = randomUUID();
    this.localKnowledgeImportBatches.set(batchId, {
      senderId,
      expiresAt: Date.now() + KNOWLEDGE_IMPORT_BATCH_TTL_MS,
      candidates,
    });
    return {
      canceled: false,
      batchId,
      candidates: candidates.map(({ candidateId, name, size, verdict, reason }) => ({
        candidateId,
        name,
        size,
        verdict,
        reason,
      })),
    };
  }

  private async commitLocalKnowledgeImportBatch(
    senderId: number,
    payload?: { batchId?: string; candidateIds?: string[] },
  ): Promise<LocalKnowledgeImportCommitResponse> {
    this.removeExpiredKnowledgeImportBatches();
    const batchId = typeof payload?.batchId === 'string' ? payload.batchId : '';
    const requestedCandidateIds = Array.isArray(payload?.candidateIds) ? payload.candidateIds : [];
    if (!batchId || requestedCandidateIds.length === 0 || requestedCandidateIds.length > MAX_KNOWLEDGE_IMPORT_BATCH_FILES) {
      throw new Error('导入批次无效，请重新选择文件。');
    }

    const batch = this.localKnowledgeImportBatches.get(batchId);
    if (!batch || batch.senderId !== senderId || batch.expiresAt <= Date.now()) {
      this.localKnowledgeImportBatches.delete(batchId);
      throw new Error('导入预检已过期或不属于当前窗口，请重新选择文件。');
    }
    // A batch token is intentionally one-time use. A retry always starts from a fresh preflight.
    this.localKnowledgeImportBatches.delete(batchId);

    const uniqueCandidateIds = [...new Set(requestedCandidateIds)];
    if (uniqueCandidateIds.length !== requestedCandidateIds.length) {
      throw new Error('导入批次包含重复条目，请重新选择文件。');
    }
    const selectedCandidates = uniqueCandidateIds.map((candidateId) => (
      batch.candidates.find((candidate) => candidate.candidateId === candidateId)
    ));
    if (selectedCandidates.some((candidate) => !candidate)) {
      throw new Error('导入批次包含未知文件，请重新选择文件。');
    }
    const readyCandidates = selectedCandidates as LocalKnowledgeImportCandidate[];
    if (readyCandidates.some((candidate) => candidate.verdict !== 'ready' || !candidate.contentHash)) {
      throw new Error('只能导入预检通过的文件，请重新选择文件。');
    }

    const result: LocalKnowledgeImportCommitResponse = { imported: [], skipped: [], failed: [] };
    for (const candidate of readyCandidates) {
      try {
        const fileContent = await this.readVerifiedLocalKnowledgeImportFile(candidate);
        const upload = await this.knowledgeSourceManager.ingestPickerContent({
          filename: candidate.name,
          content: fileContent,
        });
        if (upload.outcome === 'skipped') {
          result.skipped.push({
            candidateId: candidate.candidateId,
            name: candidate.name,
            reason: '此文件内容已在本机知识库中，已跳过。',
          });
        } else {
          result.imported.push({ candidateId: candidate.candidateId, name: candidate.name });
        }
      } catch (error) {
        const rawReason = error instanceof Error ? error.message : String(error);
        if (this.isDuplicateKnowledgeImportError(rawReason)) {
          result.skipped.push({
            candidateId: candidate.candidateId,
            name: candidate.name,
            reason: '此文件内容已在本机知识库中，已跳过。',
          });
        } else {
          result.failed.push({
            candidateId: candidate.candidateId,
            name: candidate.name,
            reason: toSafeLocalKnowledgeImportReason(error),
          });
        }
      }
    }
    return result;
  }

  private async inspectLocalKnowledgeImportFile(filePath: string): Promise<LocalKnowledgeImportCandidate> {
    const candidate: LocalKnowledgeImportCandidate = {
      candidateId: randomUUID(),
      filePath,
      name: path.basename(filePath),
      size: 0,
      modifiedAtMs: 0,
      contentHash: null,
      verdict: 'invalid',
    };
    if (!this.isSupportedKnowledgeFile(filePath)) {
      candidate.reason = '仅支持 Markdown、PDF、TXT 或 HTML 文件。';
      return candidate;
    }
    try {
      const fileContent = await this.readLimitedKnowledgeImportFile(filePath);
      candidate.size = fileContent.size;
      candidate.modifiedAtMs = fileContent.modifiedAtMs;
      candidate.contentHash = createHash('sha256').update(fileContent.content).digest('hex');
      candidate.verdict = 'ready';
      return candidate;
    } catch (error) {
      candidate.reason = toSafeLocalKnowledgeImportReason(error);
      return candidate;
    }
  }

  private async readVerifiedLocalKnowledgeImportFile(
    candidate: LocalKnowledgeImportCandidate,
  ): Promise<Buffer> {
    if (!this.isSupportedKnowledgeFile(candidate.filePath)) {
      throw new Error('文件类型在预检后发生变化，请重新选择文件。');
    }
    try {
      const fileContent = await this.readLimitedKnowledgeImportFile(candidate.filePath);
      const currentHash = createHash('sha256').update(fileContent.content).digest('hex');
      if (currentHash !== candidate.contentHash) {
        throw new Error('文件内容在预检后发生变化，请重新选择文件。');
      }
      return fileContent.content;
    } catch (error) {
      const reason = toSafeLocalKnowledgeImportReason(error);
      if (
        reason !== '文件导入失败，请重新预检后重试。'
        && reason !== '无法读取文件，请检查访问权限后重试。'
      ) {
        throw error;
      }
      throw new Error('文件在预检后无法读取，请重新选择文件。');
    }
  }

  public async readManagedSourceFile(filePath: string): Promise<ManagedSourceReadResult> {
    const file = await this.readLimitedKnowledgeImportFile(filePath, { rejectSymlink: true });
    return { content: file.content, size: file.size, modifiedAtMs: file.modifiedAtMs };
  }

  private async readLimitedKnowledgeImportFile(
    filePath: string,
    options: { rejectSymlink?: boolean } = {},
  ): Promise<LocalKnowledgeImportFileContent> {
    let handle: fs.promises.FileHandle | null = null;
    try {
      handle = options.rejectSymlink
        ? await fs.promises.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
        : await fs.promises.open(filePath, 'r');
      const before = await handle.stat();
      if (!before.isFile()) {
        throw new Error('所选路径不是文件。');
      }
      if (before.size === 0) {
        throw new Error('文件为空，无法导入。');
      }
      if (before.size > MAX_KNOWLEDGE_IMPORT_FILE_BYTES) {
        throw new Error('单个文件超过 20 MB 上限。');
      }

      const content = Buffer.allocUnsafe(before.size);
      let offset = 0;
      while (offset < content.length) {
        const { bytesRead } = await handle.read(content, offset, content.length - offset, offset);
        if (bytesRead === 0) {
          break;
        }
        offset += bytesRead;
      }
      const after = await handle.stat();
      if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        throw new Error('文件在读取时发生变化，请重新选择文件。');
      }
      return { content, size: before.size, modifiedAtMs: before.mtimeMs };
    } catch (error) {
      const reason = toSafeLocalKnowledgeImportReason(error);
      if (reason !== '文件导入失败，请重新预检后重试。') {
        throw error;
      }
      throw new Error('无法读取文件，请检查访问权限后重试。');
    } finally {
      await handle?.close();
    }
  }

  private readExistingContentHashes(response: unknown): Set<string> {
    if (!response || typeof response !== 'object') {
      throw new Error('本机服务返回了无效的重复检查结果。');
    }
    const rawHashes = (response as { existingContentHashes?: unknown }).existingContentHashes;
    if (!Array.isArray(rawHashes)) {
      throw new Error('本机服务返回了无效的重复检查结果。');
    }
    return new Set(
      rawHashes
        .filter((hash): hash is string => typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash))
        .map((hash) => hash.toLowerCase()),
    );
  }

  private removeExpiredKnowledgeImportBatches(): void {
    const now = Date.now();
    this.localKnowledgeImportBatches.forEach((batch, batchId) => {
      if (batch.expiresAt <= now) {
        this.localKnowledgeImportBatches.delete(batchId);
      }
    });
  }

  private isDuplicateKnowledgeImportError(message: string): boolean {
    return /duplicate|already imported|已在本机知识库中|已导入|重复/i.test(message);
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

  private async selectKnowledgeFiles(): Promise<string[] | null> {
    const options: OpenDialogOptions = {
      title: '选择本机资料（最多 20 个）',
      buttonLabel: '预检并导入',
      properties: ['openFile', 'multiSelections'],
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
    return result.filePaths;
  }

  private async selectManagedSourceFolder(): Promise<string | null> {
    const options: OpenDialogOptions = {
      title: '选择自动收集资料目录',
      buttonLabel: '使用此目录',
      properties: ['openDirectory'],
    };
    const window = this.mainWindowGetter();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  private async saveKnowledgeBackup(
    content: unknown,
    suggestedName: unknown,
    window: BrowserWindow,
  ): Promise<{ canceled: boolean; filePath?: string }> {
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error('备份内容为空。');
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_KNOWLEDGE_BACKUP_BYTES) {
      throw new Error('备份文件超过 100 MB 上限。');
    }

    const result = await dialog.showSaveDialog(window, {
      title: '导出 Knowledge Desk 备份',
      defaultPath: path.join(app.getPath('downloads'), this.backupFileName(suggestedName)),
      filters: [{ name: 'Knowledge Desk backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.promises.writeFile(result.filePath, content, { encoding: 'utf8', mode: 0o600 });
    await fs.promises.chmod(result.filePath, 0o600);
    return { canceled: false, filePath: result.filePath };
  }

  private async selectKnowledgeBackup(
    window: BrowserWindow,
  ): Promise<{ canceled: boolean; content?: string; fileName?: string }> {
    const result = await dialog.showOpenDialog(window, {
      title: '导入 Knowledge Desk 备份',
      buttonLabel: '选择备份文件',
      properties: ['openFile'],
      filters: [{ name: 'Knowledge Desk backup', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    if (path.extname(filePath).toLowerCase() !== '.json') {
      throw new Error('仅支持 JSON 备份文件。');
    }
    const metadata = await fs.promises.stat(filePath);
    if (!metadata.isFile() || metadata.size > MAX_KNOWLEDGE_BACKUP_BYTES) {
      throw new Error('备份文件无效或超过 100 MB 上限。');
    }

    return {
      canceled: false,
      content: await fs.promises.readFile(filePath, 'utf8'),
      fileName: path.basename(filePath),
    };
  }

  private backupFileName(value: unknown): string {
    const raw = typeof value === 'string' ? path.basename(value.trim()) : '';
    const sanitized = raw.replace(/[^a-zA-Z0-9._-]/g, '-');
    if (sanitized && sanitized.toLowerCase().endsWith('.json')) {
      return sanitized;
    }
    return 'knowledge-desk-backup.json';
  }

  private async importKnowledgeLocalFile(filePath: string, title?: string): Promise<ManagedSourceUploadResult> {
    const filename = path.basename(filePath);
    const fileBuffer = (await this.readLimitedKnowledgeImportFile(filePath)).content;
    return this.knowledgeSourceManager.ingestPickerContent({ filename, content: fileBuffer, title });
  }

  public async uploadManagedSourceFile(
    request: ManagedSourceUploadRequest,
  ): Promise<ManagedSourceUploadResult> {
    try {
      const item = await this.importKnowledgeLocalFileContent(
        request.filename,
        request.content,
        request.title,
        {
          sourceAssetId: request.sourceAssetId,
          sourceAssetOrigin: request.sourceAssetOrigin,
        },
      );
      return { outcome: 'imported', item };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.isDuplicateKnowledgeImportError(message)) return { outcome: 'skipped' };
      throw error;
    }
  }

  private async importKnowledgeLocalFileContent(
    filename: string,
    fileBuffer: Buffer,
    title?: string,
    sourceAsset?: { sourceAssetId: string; sourceAssetOrigin: 'picker' | 'watched_folder' },
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: this.mimeTypeForKnowledgeFile(filename) }), filename);

    const normalizedTitle = title?.trim();
    if (normalizedTitle) {
      formData.append('title', normalizedTitle);
    }
    if (sourceAsset) {
      formData.append('sourceAssetId', sourceAsset.sourceAssetId);
      formData.append('sourceAssetOrigin', sourceAsset.sourceAssetOrigin);
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
    if (pathname === '/api/v1/ingestion-jobs') {
      // The renderer only needs the auditable job list; keep this surface exact and read-only.
      return method === 'GET';
    }

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
