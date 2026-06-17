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
    ipcRenderer.on('terminal:incomingData', (_event, data) => callback(data));
  },
  terminalKeystroke: (data: string) => ipcRenderer.send('terminal:keystroke', data),
  terminalResize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),

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
  },

  terminal: {
    spawn: () => ipcRenderer.invoke('terminal:spawn'),
    write: (data: string) => ipcRenderer.send('terminal:keystroke', data),
    resize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),
    onData: (callback: (data: string) => void) => {
      ipcRenderer.on('terminal:incomingData', (_event, data) => callback(data));
    }
  }
});
