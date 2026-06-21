import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  backendStatus: () => ipcRenderer.invoke('backend:status'),
  backendRestart: () => ipcRenderer.invoke('backend:restart'),
  openBackendLogFile: () => ipcRenderer.invoke('backend:open-log-file'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  dataDir: () => ipcRenderer.invoke('app:data-dir'),
  openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
  backendPort: () => ipcRenderer.invoke('backend:port'),
  cliExecute: (args: string[]) => ipcRenderer.invoke('cli:execute', args),
  cliInput: (input: string) => ipcRenderer.send('cli:input', input),
  onBackendStatusChanged: (callback: (status: any) => void) => {
    ipcRenderer.on('backend:status-changed', (_event, status) => callback(status));
  },
  onTerminalData: (callback: (data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('terminal:incomingData', listener);
    return () => ipcRenderer.removeListener('terminal:incomingData', listener);
  },
  terminalKeystroke: (data: string) => ipcRenderer.send('terminal:keystroke', data),
  terminalResize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),

  // Generic invoke — allows renderer to call any IPC handler by channel name.
  // Used by new layout components (MainLayout, SessionList, ChatArea, ContextPanel).
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  // Workspace API
  workspace: {
    getAll: () => ipcRenderer.invoke('workspace:get-all'),
    getActive: () => ipcRenderer.invoke('workspace:get-active'),
    setActive: (path: string) => ipcRenderer.invoke('workspace:set-active', path),
    add: () => ipcRenderer.invoke('workspace:add'),
  },

  // Git API
  git: {
    getBranches: (path: string) => ipcRenderer.invoke('git:get-branches', path),
    getCurrentBranch: (path: string) => ipcRenderer.invoke('git:get-current-branch', path),
    checkout: (path: string, branch: string) => ipcRenderer.invoke('git:checkout', path, branch),
    createBranch: (path: string, branch: string) => ipcRenderer.invoke('git:create-branch', path, branch),
    getStatus: (path: string) => ipcRenderer.invoke('git:get-status', path),
    getDiff: (path: string, file?: string) => ipcRenderer.invoke('git:get-diff', path, file),
  },

  // Chat API
  chat: {
    getSessions: () => ipcRenderer.invoke('chat:get-sessions'),
    getSession: (id: string) => ipcRenderer.invoke('chat:get-session', id),
    createSession: (branch?: string) => ipcRenderer.invoke('chat:create-session', branch),
    appendMessage: (id: string, msg: any) => ipcRenderer.invoke('chat:append-message', id, msg),
    summarizeTitle: (id: string, text: string) => ipcRenderer.invoke('chat:summarize-title', id, text),
    streamWithContext: (payload: {
      message: string;
      workspacePath?: string;
      selectedFiles?: string[];
      sessionId?: string;
      provider?: string;
      model?: string;
      customBaseUrl?: string;
      customApiKey?: string;
    }) => ipcRenderer.invoke('chat:send-with-context', payload),
    testConnection: (payload: {
      provider: string;
      customBaseUrl: string;
      customApiKey: string;
      model: string;
    }) => ipcRenderer.invoke('chat:test-connection', payload),
    onStreamEvent: (callback: (event: any) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('chat:stream-event', listener);
      return () => ipcRenderer.removeListener('chat:stream-event', listener);
    },
  },

  agent: {
    submitTask: (prompt: string) => ipcRenderer.invoke('agent:submit-task', { prompt }),
    approvePlan: (taskId: string, approved: boolean) =>
      ipcRenderer.invoke('agent:approve-plan', { taskId, approved }),
    onTaskEvent: (callback: (event: any) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('agent:task-event', listener);
      return () => ipcRenderer.removeListener('agent:task-event', listener);
    },
  },

  // Local Service API
  localService: {
    port: () => ipcRenderer.invoke('local-service:port'),
    isReady: () => ipcRenderer.invoke('local-service:is-ready'),
  },

  terminal: {
    spawn: (cwd?: string) => ipcRenderer.invoke('terminal:spawn', cwd),
    write: (data: string) => ipcRenderer.send('terminal:keystroke', data),
    resize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),
    onData: (callback: (data: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
      ipcRenderer.on('terminal:incomingData', listener);
      return () => ipcRenderer.removeListener('terminal:incomingData', listener);
    }
  },

  // ================================================================
  // Thread API (Phase 1 — multi-agent thread management)
  // ================================================================
  thread: {
    create: (opts: { name: string; projectPath: string; mode?: 'local' | 'worktree' }) =>
      ipcRenderer.invoke('thread:create', opts),
    list: () => ipcRenderer.invoke('thread:list'),
    get: (id: string) => ipcRenderer.invoke('thread:get', id),
    switch: (id: string) => ipcRenderer.invoke('thread:switch', id),
    remove: (id: string) => ipcRenderer.invoke('thread:remove', id),
    rename: (id: string, name: string) => ipcRenderer.invoke('thread:rename', id, name),
    setStatus: (id: string, status: string) => ipcRenderer.invoke('thread:set-status', id, status),
    onEvent: (callback: (thread: any) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('thread:event', listener);
      return () => ipcRenderer.removeListener('thread:event', listener);
    }
  },

  // ================================================================
  // Tool Approval API (Phase 1 — agent tool execution bridge)
  // ================================================================
  tool: {
    approve: (payload: { toolCallId: string; toolName: string; arguments: Record<string, unknown>; threadId: string }) =>
      ipcRenderer.invoke('tool:approve', payload),
    reject: (payload: { toolCallId: string }) =>
      ipcRenderer.invoke('tool:reject', payload),
  },

  // ================================================================
  // Approval Policy API
  // ================================================================
  approval: {
    getPolicy: () => ipcRenderer.invoke('approval:get-policy'),
    getMode: () => ipcRenderer.invoke('approval:get-mode'),
    setMode: (mode: string) => ipcRenderer.invoke('approval:set-mode', mode),
  },

  computer: {
    permissions: () => ipcRenderer.invoke('computer:permissions'),
    screenshot: () => ipcRenderer.invoke('computer:screenshot'),
    click: (params: { x: number; y: number; button?: 'left' | 'right' }) =>
      ipcRenderer.invoke('computer:click', params),
    type: (params: { text: string }) => ipcRenderer.invoke('computer:type', params),
    key: (params: { key: string; modifiers?: string[] }) => ipcRenderer.invoke('computer:key', params),
    scroll: (params: { dx?: number; dy?: number }) => ipcRenderer.invoke('computer:scroll', params),
    openSettings: (pane?: 'accessibility' | 'screenRecording') =>
      ipcRenderer.invoke('computer:open-settings', pane),
  },

  // ================================================================
  // Thread-aware Terminal Pool API
  // ================================================================
  terminalPool: {
    spawnForThread: (payload: { threadId: string; cwd: string }) =>
      ipcRenderer.invoke('terminal:spawn-for-thread', payload),
    list: () => ipcRenderer.invoke('terminal:list'),
    write: (payload: { terminalId: string; data: string }) =>
      ipcRenderer.invoke('terminal:write', payload),
  },

  // ================================================================
  // Review API (Phase 2 — diff review panel)
  // ================================================================
  review: {
    getDiff: (projectPath: string) => ipcRenderer.invoke('review:get-diff', projectPath),
    stageFile: (projectPath: string, file: string) => ipcRenderer.invoke('review:stage-file', projectPath, file),
    revertFile: (projectPath: string, file: string) => ipcRenderer.invoke('review:revert-file', projectPath, file),
    stageHunk: (projectPath: string, file: string, hunkIndex: number) =>
      ipcRenderer.invoke('review:stage-hunk', projectPath, file, hunkIndex),
    revertHunk: (projectPath: string, file: string, hunkIndex: number) =>
      ipcRenderer.invoke('review:revert-hunk', projectPath, file, hunkIndex),
    commit: (projectPath: string, message: string) => ipcRenderer.invoke('review:commit', projectPath, message),
    push: (projectPath: string) => ipcRenderer.invoke('review:push', projectPath),
    createPr: (projectPath: string, options: { title: string; body?: string; base?: string }) =>
      ipcRenderer.invoke('review:create-pr', projectPath, options),
  },

  // ================================================================
  // Skills API (Phase 2 Track B)
  // ================================================================
  skill: {
    discover: () => ipcRenderer.invoke('skill:discover'),
    list: () => ipcRenderer.invoke('skill:list'),
    get: (name: string) => ipcRenderer.invoke('skill:get', name),
    read: (name: string) => ipcRenderer.invoke('skill:read', name),
    install: (sourcePath: string, targetName?: string) => ipcRenderer.invoke('skill:install', sourcePath, targetName),
    refresh: () => ipcRenderer.invoke('skill:refresh'),
    setProjectPaths: (projectPath?: string, workspacePath?: string) =>
      ipcRenderer.invoke('skill:set-project-paths', projectPath, workspacePath),
  },
});
